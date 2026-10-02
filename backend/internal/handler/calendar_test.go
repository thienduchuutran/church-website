package handler

import (
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

func sptr(s string) *string { return &s }

// stripAdminOnlyFields is the single boundary between what an admin may see and
// what goes out to the public internet. Nothing else in the read path makes this
// decision, so these cases are the only thing standing between a household's
// street address and vgomne.org.
//
// The rule it enforces is deliberately field-level rather than all-or-nothing:
// a venue's NAME ("Hoang House") is public so the calendar can say whose house a
// Bible study is at, while its ADDRESS stays admin-only. The two used to be
// stripped together.
func TestStripAdminOnlyFields(t *testing.T) {
	// A private venue - the normal case for a Bible study hosted at a home.
	privateEvent := func() model.CalendarEvent {
		return model.CalendarEvent{
			Title:          "Friday BBS",
			EventType:      "bible_study",
			AddressPublic:  false,
			PrivateAddress: sptr("203 Essex Street, Saugus MA 01906"),
			PlaceID:        sptr("place-uuid"),
			Place:          &model.CalendarPlace{ID: "place-uuid", Name: "Hoang House", Address: "203 Essex Street, Saugus MA 01906"},
			TitleSource:    sptr("Friday BBS"),
			NotesSource:    sptr("bring a friend"),
		}
	}

	t.Run("public viewer keeps the house name but never the address", func(t *testing.T) {
		resp := &model.CalendarMonthResponse{Events: []model.CalendarEvent{privateEvent()}}
		stripAdminOnlyFields(resp, false)
		e := resp.Events[0]

		if e.Place == nil {
			t.Fatal("place was removed entirely; the house name is public")
		}
		if e.Place.Name != "Hoang House" {
			t.Errorf("place name = %q, want %q", e.Place.Name, "Hoang House")
		}
		// The whole point. A street address must not survive to a logged-out
		// viewer by any route - neither field.
		if e.Place.Address != "" {
			t.Errorf("place address leaked to the public: %q", e.Place.Address)
		}
		if e.PrivateAddress != nil {
			t.Errorf("private_address leaked to the public: %q", *e.PrivateAddress)
		}
	})

	t.Run("public viewer never receives authored source text", func(t *testing.T) {
		resp := &model.CalendarMonthResponse{
			Events: []model.CalendarEvent{privateEvent()},
			MonthNote: &model.CalendarMonthNote{
				ContentSource:        sptr("note"),
				ThemeSource:          sptr("theme"),
				VerseTextSource:      sptr("verse"),
				VerseReferenceSource: sptr("ref"),
				VerseTextAlt:         sptr("cau goc"),
			},
		}
		stripAdminOnlyFields(resp, false)

		if resp.Events[0].TitleSource != nil || resp.Events[0].NotesSource != nil {
			t.Error("event source text leaked to the public")
		}
		n := resp.MonthNote
		if n.ContentSource != nil || n.ThemeSource != nil || n.VerseTextSource != nil ||
			n.VerseReferenceSource != nil || n.VerseTextAlt != nil {
			t.Error("month note source text leaked to the public")
		}
	})

	// address_public is the admin's explicit "this one may be shown", so nothing
	// is stripped from it at all.
	t.Run("an address marked public survives for a public viewer", func(t *testing.T) {
		e := privateEvent()
		e.AddressPublic = true
		resp := &model.CalendarMonthResponse{Events: []model.CalendarEvent{e}}
		stripAdminOnlyFields(resp, false)

		got := resp.Events[0]
		if got.PrivateAddress == nil {
			t.Fatal("a public address was stripped")
		}
		if got.Place == nil || got.Place.Address == "" {
			t.Error("a public venue lost its address")
		}
	})

	t.Run("admins see everything", func(t *testing.T) {
		resp := &model.CalendarMonthResponse{
			Events:    []model.CalendarEvent{privateEvent()},
			MonthNote: &model.CalendarMonthNote{ContentSource: sptr("note")},
		}
		stripAdminOnlyFields(resp, true)

		e := resp.Events[0]
		if e.PrivateAddress == nil || e.Place == nil || e.Place.Address == "" {
			t.Error("an admin lost the address they are allowed to see")
		}
		if e.TitleSource == nil {
			t.Error("an admin lost the source text the edit form needs")
		}
		if resp.MonthNote.ContentSource == nil {
			t.Error("an admin lost the month note source the modal edits")
		}
	})

	// An event with no venue at all must not acquire one, and must not panic on
	// the nil Place the blanking now has to reach through.
	t.Run("an event with no place is left alone", func(t *testing.T) {
		resp := &model.CalendarMonthResponse{
			Events: []model.CalendarEvent{{Title: "Sunday Service", AddressPublic: false}},
		}
		stripAdminOnlyFields(resp, false)
		if resp.Events[0].Place != nil {
			t.Error("an event with no place came back with one")
		}
	})

	// A month with no note is the common case and must not panic.
	t.Run("a month with no note is left alone", func(t *testing.T) {
		resp := &model.CalendarMonthResponse{Events: []model.CalendarEvent{privateEvent()}}
		stripAdminOnlyFields(resp, false)
		if resp.MonthNote != nil {
			t.Error("a month note appeared from nowhere")
		}
	})
}
