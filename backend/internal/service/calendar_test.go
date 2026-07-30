package service

import (
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

func strptr(s string) *string { return &s }

func TestBuildSeedLine(t *testing.T) {
	tests := []struct {
		name string
		e    *model.CalendarEvent
		want string
	}{
		{
			name: "single day",
			e:    &model.CalendarEvent{Date: "2026-05-22", Title: "Game Night"},
			want: "• May 22: Game Night",
		},
		{
			name: "end equal to start is single day",
			e:    &model.CalendarEvent{Date: "2026-05-22", EndDate: strptr("2026-05-22"), Title: "Workday"},
			want: "• May 22: Workday",
		},
		{
			name: "same-month span",
			e:    &model.CalendarEvent{Date: "2026-05-22", EndDate: strptr("2026-05-25"), Title: "Youth Camp"},
			want: "• May 22-25: Youth Camp",
		},
		{
			name: "cross-month span",
			e:    &model.CalendarEvent{Date: "2026-05-30", EndDate: strptr("2026-06-02"), Title: "Conference"},
			want: "• May 30 - Jun 2: Conference",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildSeedLine(tt.e); got != tt.want {
				t.Fatalf("buildSeedLine() = %q, want %q", got, tt.want)
			}
		})
	}
}

// resolveSourceLocale reads the text and nothing else. The UI locale is not an
// input, so these cases are all about what was typed.
func TestResolveSourceLocale(t *testing.T) {
	tests := []struct {
		name    string
		fields  map[string]string
		current string
		want    string
	}{
		// Mostly one language wins; a few borrowed words do not flip it.
		{
			name:   "mostly english with a vietnamese term is english",
			fields: map[string]string{"title": "Worship service at the Hoi thanh"},
			want:   "en",
		},
		{
			name:   "mostly english body with a vietnamese phrase is english",
			fields: map[string]string{"title": "Sunday Service", "notes": "Everyone is welcome to join us for thá»© phÆ°á»£ng"},
			want:   "en",
		},
		{
			name:   "mostly vietnamese is vietnamese",
			fields: map[string]string{"title": "ÄÃªm ThÃ¡nh Nháº¡c"},
			want:   "vi",
		},
		{
			name:   "mostly vietnamese with an english word is vietnamese",
			fields: map[string]string{"notes": "Buá»i thá» phÆ°á»£ng cÃ³ guest speaker tuáº§n nÃ y"},
			want:   "vi",
		},

		// The only case with no text to read: a PATCH that changes no text field
		// keeps the language already stored rather than resetting it.
		{
			name:    "date-only edit preserves the stored language",
			fields:  map[string]string{},
			current: "vi",
			want:    "vi",
		},
		{
			name: "no text and no history is english",
			want: "en",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveSourceLocale(tc.fields, tc.current); got != tc.want {
				t.Errorf("resolveSourceLocale = %q, want %q", got, tc.want)
			}
		})
	}
}

// textFields feeds detection. Blank values must not count - they would sit in the
// denominator of the word ratio and drag it toward English.
func TestTextFields(t *testing.T) {
	if got := textFields("Title", strptr("  ")); len(got) != 1 || got["title"] != "Title" {
		t.Errorf("blank notes should be dropped, got %v", got)
	}
	if got := textFields("  ", nil); len(got) != 0 {
		t.Errorf("blank title should be dropped, got %v", got)
	}
	if got := textFields("T", strptr("N")); len(got) != 2 {
		t.Errorf("both fields should survive, got %v", got)
	}
}
