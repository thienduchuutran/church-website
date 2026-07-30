package translation

import (
	"sort"
	"strings"
	"unicode"
)

// Language detection for admin-authored content.
//
// The rule is proportional, not presence-based: a record's source language is
// whichever language most of its words are in. A mostly-English announcement
// that borrows a few Vietnamese church terms ("worship at the Hội thánh") is
// English and gets translated to Vietnamese; a mostly-Vietnamese one is
// Vietnamese and gets translated to English.
//
// The admin's UI locale is deliberately NOT an input. Which language the panel
// happens to be displaying says nothing about which language the admin is typing
// in, and letting it vote is exactly how an English post composed in Vietnamese
// mode ends up filed as Vietnamese.
//
// Detection runs synchronously inside a save, so it is pure string work - no
// model call, no network, no failure mode.

// vietnameseWordRatio is the share of words that must carry Vietnamese diacritics
// for a record to count as Vietnamese.
//
// The one number here worth tuning. Real Vietnamese prose runs high - "Xin mời
// quý vị đến thờ phượng Chúa" is 7 of 8 words - because most Vietnamese
// syllables carry a tone mark or a Vietnamese-specific vowel. English that
// borrows church vocabulary stays low, since the borrowed terms are a small
// fraction of the sentence. 0.4 sits in the wide gap between those, with margin
// on the Vietnamese side for sentences that happen to use more unmarked words
// than usual.
const vietnameseWordRatio = 0.4

// latinDiacritics are precomposed Latin letters Vietnamese uses that plain
// English does not.
//
// Accented vowels that also appear in French and Spanish loanwords (à, á, é, ...)
// ARE included here, which an earlier presence-based version could not afford -
// one "café" would have flipped a whole English note. Under a ratio that stops
// mattering: one accented word out of twelve is 8%, nowhere near the threshold.
// Counting them is what lets ordinary Vietnamese like "Thánh Kinh Hè" register
// at all, since sắc and huyền are its two commonest tones.
const latinDiacritics = "àáâãèéêìíòóôõùúýỳ" +
	"ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ" +
	"ăâđêôơưĩũ" +
	"ĂÂĐÊÔƠƯĨŨ"

// hasVietnameseMark reports whether a single word carries a Vietnamese diacritic.
func hasVietnameseMark(word string) bool {
	for _, r := range word {
		switch {
		// U+1EA0..U+1EF9 (Latin Extended Additional) is allocated almost
		// entirely to Vietnamese, and covers every hook-above and dot-below
		// vowel in one test.
		case r >= 0x1EA0 && r <= 0x1EF9:
			return true
		// Decomposed (NFD) input: the base letter is plain ASCII and the tone
		// arrives as a separate combining rune. Text pasted out of some editors
		// and mail clients looks like this, and the precomposed checks would
		// miss all of it.
		case r == 0x0300, r == 0x0301, r == 0x0303, r == 0x0309, r == 0x0323:
			return true
		case strings.ContainsRune(latinDiacritics, r):
			return true
		}
	}
	return false
}

// words splits text into countable words: runs of letters and digits, with
// punctuation and whitespace discarded. Tokens without any letter (a bare "2026",
// a stray "-") are dropped rather than counted, so a date-heavy title cannot
// dilute the ratio toward English.
func words(text string) []string {
	raw := strings.FieldsFunc(text, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
	out := make([]string, 0, len(raw))
	for _, w := range raw {
		if strings.IndexFunc(w, unicode.IsLetter) >= 0 {
			out = append(out, w)
		}
	}
	return out
}

// DetectLocale returns "vi" or "en" for a piece of text.
//
// Empty or letterless text is "en" - the value every row carried before
// migration 000013, and the only sane default for a record with nothing to read.
//
// The known limitation is Vietnamese typed without diacritics ("Trung Thu"):
// nothing distinguishes it from English, so it lands as English. That falls
// directly out of the ratio rule rather than being a special case, and the fix is
// to type the diacritics.
func DetectLocale(text string) string {
	ws := words(text)
	if len(ws) == 0 {
		return "en"
	}
	viet := 0
	for _, w := range ws {
		if hasVietnameseMark(w) {
			viet++
		}
	}
	if float64(viet)/float64(len(ws)) >= vietnameseWordRatio {
		return "vi"
	}
	return "en"
}

// DetectLocaleFields runs detection across every text field of one record.
//
// Fields are concatenated rather than voted on individually. A record has a
// single source_locale covering all its text, and a calendar event's title is
// often too short to judge on its own while its notes are not - so the ratio is
// measured over everything the record actually says.
func DetectLocaleFields(fields map[string]string) string {
	parts := make([]string, 0, len(fields))
	for _, v := range fields {
		if s := strings.TrimSpace(v); s != "" {
			parts = append(parts, s)
		}
	}
	return DetectLocale(strings.Join(parts, "\n"))
}

// normalizeLocale collapses anything unrecognized to "en", the value every
// pre-000013 row carries. Used on values arriving from the database and the
// queue, where an empty string means "written before this column existed".
func normalizeLocale(l string) string {
	switch strings.ToLower(strings.TrimSpace(l)) {
	case "vi":
		return "vi"
	default:
		return "en"
	}
}

// OtherLocales returns every supported locale except src - the set a record
// authored in src needs translating into. Replaces the hardcoded
// TargetLocales: []string{"vi"} that every enqueue site used to pass, which was
// correct only while English was the sole possible source.
func (t *Translator) OtherLocales(src string) []string {
	src = normalizeLocale(src)
	// "en" is not in t.supported (it is the implicit base locale, and
	// SUPPORTED_LOCALES lists only the translation targets), so it has to be
	// added explicitly - a Vietnamese-authored record needs an English
	// translation, and that is the whole point of this change.
	candidates := make([]string, 0, len(t.supported)+1)
	if src != "en" {
		candidates = append(candidates, "en")
	}
	for l := range t.supported {
		if l != "" && l != src {
			candidates = append(candidates, l)
		}
	}
	// Sorted because the source is a map: without this the job's target_locales
	// array would vary between identical calls, which makes the enqueued row
	// non-reproducible and the tests flaky for no reason.
	sort.Strings(candidates)
	return candidates
}
