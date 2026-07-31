package model

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Address normalization for calendar_places.address_key (migration 000014).
//
// The whole point of the places table is that a place name is a function of its
// address, so the address has to be a stable key. An admin typing the same
// house twice - once as "101 Main St, Saugus MA 01906" and once as
// "101 main street, saugus, massachusetts" - must land on one row, or the
// Locations strip prints the church twice again and the model gets asked to
// name it twice.
//
// The two failure modes are not symmetric. Failing to collapse two spellings
// leaves a duplicate row, which is merely today's behaviour. Collapsing two
// genuinely different addresses prints the wrong family's house on the public
// calendar and nobody notices until it is already in the exported PNG. So this
// folds only what is unambiguous, and prefers a missed match over a wrong one -
// "St Mary's Church Rd" (Saint) normalizing as "street" is a known and accepted
// miss, because guessing at it would risk the other direction.

// streetTypeMap folds the USPS-style suffixes and directionals that appear in
// the addresses this church actually uses. Deliberately short: every entry is a
// chance to over-match, and an abbreviation nobody types is pure risk.
var streetTypeMap = map[string]string{
	"st": "street", "str": "street",
	"ave": "avenue", "av": "avenue",
	"rd":   "road",
	"dr":   "drive",
	"ln":   "lane",
	"blvd": "boulevard", "blv": "boulevard",
	"ct":  "court",
	"cir": "circle",
	"pl":  "place",
	"ter": "terrace", "terr": "terrace",
	"pkwy": "parkway", "pky": "parkway",
	"hwy": "highway",
	"sq":  "square",
	"trl": "trail",
	"plz": "plaza",

	// Directionals. "N Main" and "North Main" are the same street; keeping them
	// distinct from each other matters (N vs S is a different address), which
	// the map handles by expanding to different words.
	"n": "north", "s": "south", "e": "east", "w": "west",
	"ne": "northeast", "nw": "northwest",
	"se": "southeast", "sw": "southwest",

	// Unit markers. "#4", "Apt 4" and "Apt. 4" are one address; the unit NUMBER
	// still distinguishes 4 from 5 because only the marker is folded.
	"apartment": "apt",
	"ste":       "suite",
	"rm":        "room",
	"fl":        "floor",
}

// stateMap expands US state abbreviations. Consulted only for the final token
// of an address (see NormalizeAddressKey), which is what lets "CT" mean
// Connecticut in "Hartford, CT" and Court in "8 Bridle Ct, Hartford MA" - the
// single genuinely ambiguous abbreviation in the set, and one New England
// churches hit constantly.
//
// Multi-word states expand to multiple tokens so they match the spelled-out
// form rather than gluing into a "newjersey" that matches nothing.
var stateMap = map[string]string{
	"al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas",
	"ca": "california", "co": "colorado", "ct": "connecticut", "de": "delaware",
	"fl": "florida", "ga": "georgia", "hi": "hawaii", "id": "idaho",
	"il": "illinois", "in": "indiana", "ia": "iowa", "ks": "kansas",
	"ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
	"ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
	"mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada",
	"nh": "new hampshire", "nj": "new jersey", "nm": "new mexico", "ny": "new york",
	"nc": "north carolina", "nd": "north dakota", "oh": "ohio", "ok": "oklahoma",
	"or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
	"sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah",
	"vt": "vermont", "va": "virginia", "wa": "washington", "wv": "west virginia",
	"wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia",
}

// NormalizeAddressKey turns a typed address into the identity used by
// calendar_places.address_key. Returns "" when nothing usable survives; the
// caller decides what that means (the calendar service treats it as "this event
// has no place").
//
// The result is not meant to be displayed - calendar_places.address keeps the
// human formatting for that. This is only ever compared.
//
// Order matters and is load-bearing:
//  1. Fold diacritics and drop apostrophes, so "O'Brien" and "OBrien" agree and
//     Vietnamese place names fold the way SlugifyEventType already folds labels.
//  2. Split on anything non-alphanumeric, which is what makes commas, periods,
//     dashes, and line breaks all equivalent to a space.
//  3. Drop a trailing ZIP (and its +4), because an admin who omits the ZIP means
//     the same house as one who includes it.
//  4. Expand the LAST remaining token via stateMap, before step 5 can claim it.
//  5. Expand every other token via streetTypeMap.
func NormalizeAddressKey(raw string) string {
	folded, _, err := transform.String(
		transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC),
		vietnameseDMap.Replace(raw),
	)
	if err != nil {
		folded = raw // folding is best-effort; the tokenizer below is the guarantee
	}

	// "#" is the one punctuation mark that carries meaning rather than
	// separating - it is a unit marker, and dropping it silently would make
	// "203 Essex St #4" and "203 Essex St 4" disagree with "Apt 4".
	folded = strings.ReplaceAll(folded, "#", " apt ")

	tokens := tokenizeAddress(folded)
	if len(tokens) == 0 {
		return ""
	}
	tokens = dropTrailingZip(tokens)
	if len(tokens) == 0 {
		return ""
	}

	// The state table is consulted only for the final token, which is what lets
	// a trailing "ct" become connecticut while an interior one stays available
	// to become court. A final token that is NOT a state still falls through to
	// the street table - otherwise a bare "101 Main St" (no city, which is how
	// half the seeded addresses are written) would never match "101 Main Street".
	last := len(tokens) - 1
	out := make([]string, 0, len(tokens)+1)
	for i, tok := range tokens {
		if i == last {
			if expanded, ok := stateMap[tok]; ok {
				out = append(out, strings.Fields(expanded)...)
				continue
			}
		}
		if expanded, ok := streetTypeMap[tok]; ok {
			out = append(out, expanded)
			continue
		}
		out = append(out, tok)
	}
	return strings.Join(out, " ")
}

// tokenizeAddress lowercases and splits on every non-alphanumeric rune, with
// one exception: quotes vanish instead of splitting, so a possessive stays one
// word. Same rule SlugifyEventType uses, for the same reason.
func tokenizeAddress(s string) []string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range strings.ToLower(s) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
		case r == '\'' || r == '’' || r == '"':
			// dropped, not a separator
		default:
			b.WriteByte(' ')
		}
	}
	return strings.Fields(b.String())
}

// dropTrailingZip removes a ZIP code from the end of an address, plus the +4
// block when one follows it. Anchored to the end on purpose: a 5-digit token
// anywhere else is a house number, and "01906 Main St" must keep its 01906.
func dropTrailingZip(tokens []string) []string {
	// Handle the "...ma 01906 1234" form first - the +4 is only a ZIP extension
	// if a real ZIP sits in front of it.
	if len(tokens) >= 2 && isDigits(tokens[len(tokens)-1], 4) && isDigits(tokens[len(tokens)-2], 5) {
		tokens = tokens[:len(tokens)-2]
	} else if len(tokens) >= 2 && isDigits(tokens[len(tokens)-1], 5) {
		tokens = tokens[:len(tokens)-1]
	}
	return tokens
}

// isDigits reports whether tok is exactly n digits.
func isDigits(tok string, n int) bool {
	if len(tok) != n {
		return false
	}
	for _, r := range tok {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
