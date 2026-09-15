package service

import (
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

func strptr(s string) *string { return &s }

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

// monthNoteFields collects a month note's four text fields for language
// detection and for the translation queue. It exists because the old code
// passed the note through textFields(content, nil), which labelled it "title" -
// harmless when there was one field, wrong now that there are four and each is
// enqueued under its own name.
//
// The contract is the same as textFields': empty and whitespace-only values are
// dropped, so a cleared verse cannot dilute the evidence a populated theme
// gives DetectLocaleFields.
func TestMonthNoteFields(t *testing.T) {
	cases := []struct {
		name string
		req  model.UpsertMonthNoteRequest
		want map[string]string
	}{
		{
			name: "every field populated is carried under its own key",
			req: model.UpsertMonthNoteRequest{
				Theme:          "Walking in Gratitude",
				VerseText:      "Give thanks in all circumstances.",
				VerseReference: "1 Thessalonians 5:18",
				Content:        "Bring guests on the 21st.",
			},
			want: map[string]string{
				"theme":           "Walking in Gratitude",
				"verse_text":      "Give thanks in all circumstances.",
				"verse_reference": "1 Thessalonians 5:18",
				"content":         "Bring guests on the 21st.",
			},
		},
		{
			name: "empty fields are dropped rather than carried as empty strings",
			req:  model.UpsertMonthNoteRequest{Theme: "Gratitude"},
			want: map[string]string{"theme": "Gratitude"},
		},
		{
			name: "whitespace-only is treated as empty",
			req:  model.UpsertMonthNoteRequest{Theme: "Gratitude", VerseText: "   \n  "},
			want: map[string]string{"theme": "Gratitude"},
		},
		{
			name: "a wholly cleared note yields nothing to detect or enqueue",
			req:  model.UpsertMonthNoteRequest{},
			want: map[string]string{},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := monthNoteFields(c.req)
			if len(got) != len(c.want) {
				t.Fatalf("monthNoteFields() = %v, want %v", got, c.want)
			}
			for k, v := range c.want {
				if got[k] != v {
					t.Errorf("field %q = %q, want %q", k, got[k], v)
				}
			}
		})
	}
}

// The month note's source language is detected across all four fields together,
// not from whichever one happens to be first. A Vietnamese verse alongside a
// short English-looking reference must still read as Vietnamese, because the
// reference ("1 Te-sa-lo-ni-ca 5:18") is mostly digits and proper nouns and
// carries almost no language signal.
func TestResolveSourceLocale_MonthNote(t *testing.T) {
	vi := model.UpsertMonthNoteRequest{
		Theme:          "Bước Đi Trong Lòng Biết Ơn",
		VerseText:      "Hãy cảm tạ trong mọi hoàn cảnh, vì đây là ý muốn của Đức Chúa Trời cho anh em.",
		VerseReference: "1 Tê-sa-lô-ni-ca 5:18",
	}
	if got := resolveSourceLocale(monthNoteFields(vi), ""); got != "vi" {
		t.Errorf("vietnamese month note detected as %q, want \"vi\"", got)
	}

	en := model.UpsertMonthNoteRequest{
		Theme:          "Walking in Gratitude",
		VerseText:      "Give thanks in all circumstances; for this is God's will for you in Christ Jesus.",
		VerseReference: "1 Thessalonians 5:18",
	}
	if got := resolveSourceLocale(monthNoteFields(en), ""); got != "en" {
		t.Errorf("english month note detected as %q, want \"en\"", got)
	}

	// Clearing every field leaves no evidence, so the note keeps the language it
	// already had rather than silently flipping to English - the same rule the
	// existing "no text" case in TestResolveSourceLocale pins.
	if got := resolveSourceLocale(monthNoteFields(model.UpsertMonthNoteRequest{}), "vi"); got != "vi" {
		t.Errorf("cleared month note detected as %q, want the prior \"vi\"", got)
	}
}

// The memory verse is never machine translated - the owner's call, and the same
// rule sermons already follow. A Vietnamese C&MA congregation reads Bản Truyền
// Thống; an AI paraphrase of scripture is close-but-not-the-published-wording,
// which is worthless for the one piece of text on the page people are meant to
// learn word for word.
//
// So there are two collections, deliberately different:
//
//	monthNoteFields             - evidence for language detection (all four)
//	monthNoteTranslatableFields - what gets queued for the AI (no verse)
func TestMonthNoteTranslatableFields_ExcludesVerse(t *testing.T) {
	req := model.UpsertMonthNoteRequest{
		Theme:          "Walking in Gratitude",
		VerseText:      "Give thanks in all circumstances.",
		VerseReference: "1 Thessalonians 5:18",
		Content:        "Bring guests on the 21st.",
	}

	queued := monthNoteTranslatableFields(req)
	if _, ok := queued["verse_text"]; ok {
		t.Error("verse_text was queued for machine translation; it must never be")
	}
	for _, want := range []string{"theme", "verse_reference", "content"} {
		if _, ok := queued[want]; !ok {
			t.Errorf("%s should still be queued, got %v", want, queued)
		}
	}

	// Detection still reads the verse. It is the longest piece of authored text
	// in the note, so dropping it from the evidence would make the language of a
	// verse-only month a coin flip.
	if _, ok := monthNoteFields(req)["verse_text"]; !ok {
		t.Error("verse_text must still count as evidence for language detection")
	}
}

// The verse the admin types for the other language is not evidence of anything -
// it is deliberately the opposite language from the rest of the note, so letting
// it vote would drag detection toward whichever language was typed second.
func TestMonthNoteFields_IgnoresTheAlternateVerse(t *testing.T) {
	req := model.UpsertMonthNoteRequest{
		Theme:        "Walking in Gratitude",
		VerseText:    "Give thanks in all circumstances; for this is God's will for you.",
		VerseTextAlt: "Hãy cảm tạ trong mọi hoàn cảnh, vì đây là ý muốn của Đức Chúa Trời cho anh em.",
	}
	if _, ok := monthNoteFields(req)["verse_text_alt"]; ok {
		t.Error("verse_text_alt must not be evidence for language detection")
	}
	if _, ok := monthNoteTranslatableFields(req)["verse_text_alt"]; ok {
		t.Error("verse_text_alt must never be queued - a human wrote it")
	}
	if got := resolveSourceLocale(monthNoteFields(req), ""); got != "en" {
		t.Errorf("source detected as %q, want \"en\" - the Vietnamese alt verse should not sway it", got)
	}
}

// otherLocale picks the locale the admin's alternate verse is filed under.
func TestOtherLocale(t *testing.T) {
	if got := otherLocale("en"); got != "vi" {
		t.Errorf("otherLocale(en) = %q, want vi", got)
	}
	if got := otherLocale("vi"); got != "en" {
		t.Errorf("otherLocale(vi) = %q, want en", got)
	}
}
