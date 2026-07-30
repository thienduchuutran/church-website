package translation

import "testing"

// The rule: whichever language MOST of the words are in. Presence of a few
// foreign words does not flip a record.
func TestDetectLocale(t *testing.T) {
	cases := []struct {
		name string
		text string
		want string
	}{
		// --- Mostly English -> en, even with Vietnamese words mixed in ---
		// This pair is the whole point of the ratio rule. A presence-based check
		// called both of these Vietnamese.
		{
			"english sentence borrowing a vietnamese church term",
			"Please join us for worship service this Sunday at the Hội thánh",
			"en",
		},
		{
			"english announcement with a vietnamese name",
			"Guest speaker this week is Mục sư Nguyễn, everyone is welcome to come",
			"en",
		},
		{"plain english title", "Christmas Party", "en"},
		{"plain english sentence", "Bring a dish to share and invite your friends", "en"},
		// One accented loanword in an English sentence is ~8% of the words -
		// nowhere near the threshold. Including accented vowels in the Vietnamese
		// set is only safe because the rule is proportional.
		{"english with a french loanword", "Coffee and café in the fellowship hall after service", "en"},

		// --- Mostly Vietnamese -> vi ---
		{"vietnamese sentence", "Xin mời quý vị đến thờ phượng Chúa", "vi"},
		{"vietnamese title with tone marks", "Thánh Kinh Hè", "vi"},
		{"vietnamese title with d-stroke", "Đêm Thánh Nhạc", "vi"},
		{"vietnamese with dot below", "Lớp học Kinh Thánh", "vi"},
		{"vietnamese borrowing an english word", "Buổi thờ phượng có guest speaker tuần này", "vi"},
		{
			"decomposed vietnamese (NFD, combining tone runes)",
			"Hỏi thánh chúng ta",
			"vi",
		},

		// --- Edges ---
		{"empty is english", "", "en"},
		{"whitespace only is english", "   \n\t ", "en"},
		{"emoji only is english", "🎉🎊", "en"},
		// Letterless tokens are dropped from the denominator, so a date-heavy
		// title cannot dilute the ratio toward English.
		{"numbers do not dilute the ratio", "2026 - Lễ Tạ Ơn - 11/26", "vi"},

		// --- Known limitation, pinned deliberately ---
		// Diacritic-less Vietnamese is indistinguishable from English by any
		// text-only rule. It reads as English; the fix is to type the diacritics.
		{"diacriticless vietnamese reads as english", "Trung Thu", "en"},
		{"acronym reads as english", "VBS", "en"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DetectLocale(tc.text); got != tc.want {
				t.Errorf("DetectLocale(%q) = %q, want %q", tc.text, got, tc.want)
			}
		})
	}
}

// A short title is often too small to judge alone while the notes are not. The
// record has one source_locale, so the ratio is measured over all of its text
// together.
func TestDetectLocaleFields(t *testing.T) {
	cases := []struct {
		name   string
		fields map[string]string
		want   string
	}{
		{
			"ambiguous title decided by vietnamese notes",
			map[string]string{"title": "VBS", "notes": "Xin mời các em đến tham dự chương trình hè"},
			"vi",
		},
		{
			"ambiguous title decided by english notes",
			map[string]string{"title": "VBS", "notes": "Bring your friends and a snack to share with everyone"},
			"en",
		},
		{
			"blank fields are ignored rather than counted",
			map[string]string{"title": "Đêm Thánh Nhạc", "notes": ""},
			"vi",
		},
		{
			"a vietnamese title is not flipped by a longer english note",
			map[string]string{"title": "Lễ Tạ Ơn", "notes": "Doors open at six in the evening for everyone"},
			"en",
		},
		{"no fields is english", map[string]string{}, "en"},
		{"all-blank fields is english", map[string]string{"title": "  ", "notes": ""}, "en"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DetectLocaleFields(tc.fields); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// OtherLocales replaces the hardcoded []string{"vi"} every enqueue site used to
// pass. The case that matters is a Vietnamese-authored record needing "en" -
// impossible before, since the translator refused an English target.
func TestOtherLocales(t *testing.T) {
	tr := NewTranslator(nil, "", []string{"vi"})

	cases := []struct {
		name string
		src  string
		want []string
	}{
		{"english source targets vietnamese", "en", []string{"vi"}},
		{"vietnamese source targets english", "vi", []string{"en"}},
		{"unset source is treated as english", "", []string{"vi"}},
		{"unknown source is treated as english", "klingon", []string{"vi"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := tr.OtherLocales(tc.src)
			if len(got) != len(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("got %v, want %v", got, tc.want)
				}
			}
		})
	}
}

// With a third language configured, an English record fans out to both targets
// and a Vietnamese one includes English. Sorted output keeps the enqueued
// target_locales array reproducible.
func TestOtherLocalesMultipleTargets(t *testing.T) {
	tr := NewTranslator(nil, "", []string{"vi", "es"})

	if got := tr.OtherLocales("en"); len(got) != 2 || got[0] != "es" || got[1] != "vi" {
		t.Errorf("en -> %v, want [es vi]", got)
	}
	if got := tr.OtherLocales("vi"); len(got) != 2 || got[0] != "en" || got[1] != "es" {
		t.Errorf("vi -> %v, want [en es]", got)
	}
}
