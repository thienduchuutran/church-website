package model

import (
	"strings"
	"testing"
)

// SlugifyEventType turns an admin-typed label into the opaque key stored on the
// event and referenced by the foreign key. These cases pin the two properties
// that matter: it must be stable (same label always yields the same slug, so
// two admins typing "Baptism" collide onto one type) and it must be safe (the
// result reaches a FK and a JSON key, so nothing but [a-z0-9_] may survive).
func TestSlugifyEventType(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Baptism", "baptism"},
		{"Fellowship Meal", "fellowship_meal"},
		{"  Youth   Retreat  ", "youth_retreat"},
		{"Youth Retreat!!!", "youth_retreat"},
		{"Church Anniversary (50th)", "church_anniversary_50th"},
		{"Mother's Day", "mothers_day"},
		{"BAPTISM", "baptism"},
		// Vietnamese labels fold to ASCII rather than shattering into single
		// letters - the congregation is Vietnamese and an admin may well type
		// the label in Vietnamese even though the admin UI authors English.
		{"Lễ Báp-têm", "le_bap_tem"},
		{"Đêm Thánh Ca", "dem_thanh_ca"},
		{"Tiệc Thánh", "tiec_thanh"},
		// Path-ish and separator-ish input must not survive in any form.
		{"../admin", "admin"},
		{"a/b\\c", "a_b_c"},
		{"drop table", "drop_table"},
		// Nothing usable left.
		{"", ""},
		{"!!!", ""},
		{"---", ""},
	}
	for _, c := range cases {
		if got := SlugifyEventType(c.in); got != c.want {
			t.Errorf("SlugifyEventType(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestSlugifyEventType_truncatesToColumnLimit(t *testing.T) {
	got := SlugifyEventType(strings.Repeat("verylongword ", 20))
	if len(got) > maxEventTypeSlugLen {
		t.Fatalf("slug length %d exceeds %d: %q", len(got), maxEventTypeSlugLen, got)
	}
	// Truncation must not leave a trailing separator - that would produce two
	// different labels slugging to keys that differ only by a dangling "_".
	if strings.HasSuffix(got, "_") {
		t.Errorf("truncated slug has trailing underscore: %q", got)
	}
}

// IsAllowedCalendarColor is the security boundary for the custom-color feature:
// whatever it accepts is rendered into an inline style attribute.
func TestIsAllowedCalendarColor(t *testing.T) {
	valid := []string{
		"slate", "red", "amber", "emerald", "sky", "violet", "rose", "stone", "black",
		"#7C3A6E", "#7c3a6e", "#000000", "#FFFFFF", "#2E7D9A",
	}
	for _, v := range valid {
		if !IsAllowedCalendarColor(v) {
			t.Errorf("IsAllowedCalendarColor(%q) = false, want true", v)
		}
	}

	invalid := []string{
		"",
		"#FFF",                         // 3-digit shorthand is not the stored form
		"#GGGGGG",                      // not hex digits
		"#1234567",                     // too long
		"7C3A6E",                       // missing the hash
		"slate ",                       // trailing space - no trimming, exact match only
		"Slate",                        // case-sensitive key lookup
		"red; background-image:url(x)", // CSS injection through a named key
		"#000000; position:fixed",      // CSS injection through a hex
		"javascript:alert(1)",
		"rgb(255,0,0)", // valid CSS, but not a form we store
		"var(--accent)",
	}
	for _, v := range invalid {
		if IsAllowedCalendarColor(v) {
			t.Errorf("IsAllowedCalendarColor(%q) = true, want false", v)
		}
	}
}

// "none" is a real, selectable icon state (the dashed None tile in the picker),
// not an absence - so it has to pass validation like any other key.
func TestAllowedCalendarIcons_includesNone(t *testing.T) {
	if !AllowedCalendarIcons[IconNone] {
		t.Fatalf("expected %q to be an allowed icon", IconNone)
	}
}

func TestCreateEventTypeRequest_Validate(t *testing.T) {
	valid := func() CreateEventTypeRequest {
		return CreateEventTypeRequest{Label: "Baptism", DefaultIcon: "star", DefaultColor: "sky"}
	}

	t.Run("minimal valid request", func(t *testing.T) {
		r := valid()
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("a custom hex is a legal default color", func(t *testing.T) {
		r := valid()
		r.DefaultColor = "#2E7D9A"
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("no icon is a legal default icon", func(t *testing.T) {
		r := valid()
		r.DefaultIcon = IconNone
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("blank label is rejected", func(t *testing.T) {
		for _, label := range []string{"", "   ", "!!!"} {
			r := valid()
			r.Label = label
			if err := r.Validate(); err == nil {
				t.Errorf("expected error for label %q, got nil", label)
			}
		}
	})

	t.Run("over-long label is rejected", func(t *testing.T) {
		r := valid()
		r.Label = strings.Repeat("x", maxEventTypeLabelLen+1)
		if err := r.Validate(); err == nil {
			t.Fatal("expected error for over-long label, got nil")
		}
	})

	t.Run("invalid icon and color are rejected", func(t *testing.T) {
		r := valid()
		r.DefaultIcon = "skull"
		if err := r.Validate(); err == nil {
			t.Error("expected error for unknown icon, got nil")
		}
		r = valid()
		r.DefaultColor = "chartreuse"
		if err := r.Validate(); err == nil {
			t.Error("expected error for unknown color, got nil")
		}
	})
}

func TestCreatePaletteColorRequest_Validate(t *testing.T) {
	t.Run("hex is accepted", func(t *testing.T) {
		r := CreatePaletteColorRequest{Hex: "#2E7D9A"}
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	// The palette table stores hex only - a named key would round-trip as a
	// swatch the picker already shows, and would fail the DB CHECK anyway.
	t.Run("named palette keys are rejected", func(t *testing.T) {
		r := CreatePaletteColorRequest{Hex: "slate"}
		if err := r.Validate(); err == nil {
			t.Fatal("expected error for named key, got nil")
		}
	})

	t.Run("malformed values are rejected", func(t *testing.T) {
		for _, hex := range []string{"", "#FFF", "#GGGGGG", "2E7D9A", "#2E7D9A; x:y"} {
			r := CreatePaletteColorRequest{Hex: hex}
			if err := r.Validate(); err == nil {
				t.Errorf("expected error for %q, got nil", hex)
			}
		}
	})
}

// The whole point of the feature: an event_type the Go binary has never heard
// of must validate, because existence is now a database question. What the
// model still owns is shape.
func TestCreateCalendarEventRequest_Validate_eventTypeShape(t *testing.T) {
	base := func() CreateCalendarEventRequest {
		return CreateCalendarEventRequest{
			Date: "2026-05-22", Title: "Baptism Service",
			EventType: "baptism", Icon: "star", Color: "slate",
		}
	}

	t.Run("an admin-created slug is accepted", func(t *testing.T) {
		for _, slug := range []string{"baptism", "fellowship_meal", "church_anniversary_50th", "general"} {
			r := base()
			r.EventType = CalendarEventType(slug)
			if err := r.Validate(); err != nil {
				t.Errorf("expected %q to validate, got %v", slug, err)
			}
		}
	})

	t.Run("malformed slugs are rejected", func(t *testing.T) {
		for _, slug := range []string{"", "Baptism", "../admin", "fellowship meal", "a-b", "x'; drop table", strings.Repeat("x", maxEventTypeSlugLen+1)} {
			r := base()
			r.EventType = CalendarEventType(slug)
			if err := r.Validate(); err == nil {
				t.Errorf("expected %q to be rejected, got nil", slug)
			}
		}
	})
}

func TestCreateCalendarEventRequest_Validate_customColorAndNoIcon(t *testing.T) {
	r := CreateCalendarEventRequest{
		Date: "2026-05-22", Title: "Baptism Service",
		EventType: "baptism", Icon: IconNone, Color: "#2E7D9A",
	}
	if err := r.Validate(); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestUpdateCalendarEventRequest_Validate_customValues(t *testing.T) {
	slug := CalendarEventType("fellowship_meal")
	icon := IconNone
	color := "#2E7D9A"
	r := UpdateCalendarEventRequest{EventType: &slug, Icon: &icon, Color: &color}
	if err := r.Validate(); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	bad := CalendarEventType("Fellowship Meal")
	r = UpdateCalendarEventRequest{EventType: &bad}
	if err := r.Validate(); err == nil {
		t.Fatal("expected error for unnormalized event type, got nil")
	}
}

// UpsertMonthNoteRequest.Validate exists to bound what reaches the translation
// queue and, through it, the AI prompt. A month note is the one admin write
// with no length ceiling anywhere else in the stack: the columns are `text`,
// the modal is a textarea, and every non-empty field is enqueued for
// translation. These cases pin the two properties that matter - a normal month
// always saves, and no single paste can push an unbounded blob through the
// worker.
func TestUpsertMonthNoteRequest_Validate(t *testing.T) {
	cases := []struct {
		name    string
		req     UpsertMonthNoteRequest
		wantErr bool
	}{
		{
			name: "a fully populated month is valid",
			req: UpsertMonthNoteRequest{
				Theme:          "Walking in Gratitude",
				VerseText:      "Give thanks in all circumstances; for this is God's will for you in Christ Jesus.",
				VerseReference: "1 Thessalonians 5:18",
				Content:        "Bring guests on the 21st.",
			},
			wantErr: false,
		},
		// Clearing every field is how an admin removes the card. It must stay
		// legal, or there would be no way to undo a theme.
		{
			name:    "all fields empty is valid",
			req:     UpsertMonthNoteRequest{},
			wantErr: false,
		},
		// Vietnamese is the authoring language for roughly half these notes and
		// its diacritics are multi-byte, so the caps must count runes rather
		// than bytes or a Vietnamese theme would hit the ceiling at a third of
		// the length of an English one.
		{
			name: "vietnamese theme well under the cap is valid",
			req: UpsertMonthNoteRequest{
				Theme:          "Bước Đi Trong Lòng Biết Ơn",
				VerseText:      "Hãy cảm tạ trong mọi hoàn cảnh, vì đây là ý muốn của Đức Chúa Trời cho anh em.",
				VerseReference: "1 Tê-sa-lô-ni-ca 5:18",
			},
			wantErr: false,
		},
		{
			name:    "theme past the cap is rejected",
			req:     UpsertMonthNoteRequest{Theme: strings.Repeat("a", MaxMonthThemeLen+1)},
			wantErr: true,
		},
		{
			name:    "theme exactly at the cap is accepted",
			req:     UpsertMonthNoteRequest{Theme: strings.Repeat("a", MaxMonthThemeLen)},
			wantErr: false,
		},
		{
			name:    "verse text past the cap is rejected",
			req:     UpsertMonthNoteRequest{VerseText: strings.Repeat("a", MaxMonthVerseLen+1)},
			wantErr: true,
		},
		{
			name:    "verse reference past the cap is rejected",
			req:     UpsertMonthNoteRequest{VerseReference: strings.Repeat("a", MaxMonthVerseRefLen+1)},
			wantErr: true,
		},
		{
			name:    "note content past the cap is rejected",
			req:     UpsertMonthNoteRequest{Content: strings.Repeat("a", MaxMonthNoteLen+1)},
			wantErr: true,
		},
		// A multi-byte theme at the rune cap must pass. This is the case a
		// byte-counting implementation gets wrong, so it is worth pinning
		// separately from the ASCII cap case above.
		{
			name:    "multibyte theme at the rune cap is accepted",
			req:     UpsertMonthNoteRequest{Theme: strings.Repeat("ơ", MaxMonthThemeLen)},
			wantErr: false,
		},
		// The reference is a single citation, never prose. A newline in it means
		// something has gone wrong in the form, and it would break the one-line
		// layout the card gives it.
		{
			name:    "newline in the verse reference is rejected",
			req:     UpsertMonthNoteRequest{VerseReference: "1 Thess 5:18\nJohn 3:16"},
			wantErr: true,
		},
		{
			name:    "newline in the theme is rejected",
			req:     UpsertMonthNoteRequest{Theme: "Walking\nin Gratitude"},
			wantErr: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.req.Validate()
			if c.wantErr && err == nil {
				t.Errorf("Validate() = nil, want an error")
			}
			if !c.wantErr && err != nil {
				t.Errorf("Validate() = %v, want nil", err)
			}
		})
	}
}
