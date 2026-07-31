package model

import "testing"

// NormalizeAddressKey decides which typed addresses are the same place. It is
// the identity behind calendar_places.address_key (migration 000014), so its
// two failure modes are not symmetric:
//
//   - Failing to collapse two spellings of one address produces a duplicate row
//     in the Locations strip. That is exactly today's behaviour - annoying, and
//     the admin can fix it by retyping.
//   - Collapsing two genuinely different addresses merges two real venues into
//     one, silently printing the wrong address for somebody's house.
//
// The second is unrecoverable without noticing it first, so the negative cases
// below carry more weight than the positive ones. Every group here is asserted
// pairwise rather than against a fixed expected string, because the exact key
// text is an implementation detail - only the equivalence classes matter.

// sameKey asserts every member of the group normalizes to one key.
func sameKey(t *testing.T, label string, inputs ...string) {
	t.Helper()
	if len(inputs) < 2 {
		t.Fatalf("%s: need at least 2 inputs to compare", label)
	}
	want := NormalizeAddressKey(inputs[0])
	if want == "" {
		t.Errorf("%s: %q normalized to the empty key", label, inputs[0])
		return
	}
	for _, in := range inputs[1:] {
		if got := NormalizeAddressKey(in); got != want {
			t.Errorf("%s: %q -> %q, but %q -> %q (expected the same place)",
				label, inputs[0], want, in, got)
		}
	}
}

// differentKey asserts two addresses stay distinct. This is the direction that
// protects a family's address from being replaced by a neighbour's.
func differentKey(t *testing.T, label, a, b string) {
	t.Helper()
	ka, kb := NormalizeAddressKey(a), NormalizeAddressKey(b)
	if ka == kb {
		t.Errorf("%s: %q and %q both -> %q (expected different places)", label, a, b, ka)
	}
}

func TestNormalizeAddressKey_FoldsFormatting(t *testing.T) {
	sameKey(t, "case",
		"101 Main St, Saugus, MA",
		"101 MAIN ST, SAUGUS, MA",
		"101 main st, saugus, ma",
	)
	sameKey(t, "whitespace and line breaks",
		"101 Main St, Saugus, MA",
		"101   Main    St,  Saugus,   MA",
		"101 Main St\nSaugus, MA",
		"\t101 Main St, Saugus, MA  ",
	)
	sameKey(t, "punctuation",
		"101 Main St, Saugus, MA",
		"101 Main St. Saugus, MA.",
		"101 Main St - Saugus - MA",
		"101 Main St; Saugus; MA",
	)
}

func TestNormalizeAddressKey_FoldsAbbreviations(t *testing.T) {
	sameKey(t, "street types",
		"101 Main St, Saugus MA",
		"101 Main Street, Saugus MA",
		"101 Main St., Saugus MA",
	)
	sameKey(t, "avenue",
		"45 Oak Ave, Lynn MA",
		"45 Oak Avenue, Lynn MA",
		"45 Oak Av., Lynn MA",
	)
	sameKey(t, "road",
		"1414 Plank Rd, Hooversville PA",
		"1414 Plank Road, Hooversville PA",
	)
	sameKey(t, "drive",
		"39 Bridle Ridge Dr, North Grafton MA",
		"39 Bridle Ridge Drive, North Grafton MA",
	)
	sameKey(t, "directional prefix",
		"12 N Main St, Saugus MA",
		"12 North Main Street, Saugus MA",
	)
	sameKey(t, "unit marker",
		"203 Essex St #4, Saugus MA",
		"203 Essex Street Apt 4, Saugus MA",
		"203 Essex St. Apt. 4, Saugus MA",
	)
	// Half the addresses already seeded on the dev database are written without
	// a city or state ("123 main st"), which puts the street type in the final
	// position - the same slot the state table claims. It must still fold.
	sameKey(t, "street type as the final token",
		"101 Main St",
		"101 Main Street",
		"101 main st.",
	)
	sameKey(t, "street type as the final token, avenue",
		"45 Oak Ave",
		"45 Oak Avenue",
	)
}

func TestNormalizeAddressKey_FoldsStates(t *testing.T) {
	sameKey(t, "massachusetts",
		"101 Main St, Saugus, MA",
		"101 Main St, Saugus, Massachusetts",
	)
	sameKey(t, "pennsylvania",
		"1414 Plank Road, Hooversville, PA",
		"1414 Plank Road, Hooversville, Pennsylvania",
	)
	// A two-word state name has to expand into two tokens, not one glued
	// "newjersey" that would never match anything typed out in full.
	sameKey(t, "new jersey",
		"7 Cedar Ln, Cherry Hill, NJ",
		"7 Cedar Lane, Cherry Hill, New Jersey",
	)
}

// A trailing ZIP is dropped, because an admin who omits it means the same
// place as one who includes it - and "101 Main St, Saugus MA" is already
// unambiguous.
func TestNormalizeAddressKey_DropsTrailingZip(t *testing.T) {
	sameKey(t, "zip present or absent",
		"101 Main St, Saugus, MA 01906",
		"101 Main St, Saugus, MA",
		"101 Main Street, Saugus, Massachusetts 01906",
	)
	sameKey(t, "zip+4",
		"1414 Plank Road, Hooversville, PA 15936-1234",
		"1414 Plank Road, Hooversville, PA 15936",
		"1414 Plank Rd, Hooversville, PA",
	)
	// The house number is not a ZIP just because it looks numeric.
	if NormalizeAddressKey("01906 Main St, Saugus MA") == NormalizeAddressKey("Main St, Saugus MA") {
		t.Error("a leading 5-digit house number was dropped as if it were a ZIP")
	}
}

// The congregation is Vietnamese and an admin may type a host's address with
// Vietnamese place names or diacritics. Folding matches SlugifyEventType so the
// two agree about what "the same text" means.
func TestNormalizeAddressKey_FoldsDiacritics(t *testing.T) {
	sameKey(t, "diacritics",
		"12 Đường Lê Lợi, Saigon",
		"12 Duong Le Loi, Saigon",
	)
	sameKey(t, "apostrophes do not split words",
		"5 O'Brien St, Lynn MA",
		"5 OBrien Street, Lynn MA",
		"5 O’Brien St, Lynn MA",
	)
}

// "CT" is Court in the middle of an address and Connecticut at the end of one.
// Position is the only thing that distinguishes them, which is why the state
// table is consulted for the trailing token before the street-type table.
func TestNormalizeAddressKey_ResolvesAmbiguousAbbreviations(t *testing.T) {
	sameKey(t, "ct as connecticut at the end",
		"8 Elm St, Hartford, CT",
		"8 Elm Street, Hartford, Connecticut",
	)
	sameKey(t, "ct as court mid-address",
		"8 Bridle Ct, Hartford MA",
		"8 Bridle Court, Hartford MA",
	)
	differentKey(t, "court is not connecticut",
		"8 Bridle Ct, Hartford MA",
		"8 Bridle, Hartford CT",
	)
}

// The expensive direction to get wrong.
func TestNormalizeAddressKey_KeepsDifferentPlacesApart(t *testing.T) {
	differentKey(t, "house number",
		"101 Main St, Saugus MA",
		"103 Main St, Saugus MA")
	differentKey(t, "street type is part of the name",
		"101 Main St, Saugus MA",
		"101 Main Ave, Saugus MA")
	differentKey(t, "city",
		"101 Main St, Saugus MA",
		"101 Main St, Lynn MA")
	differentKey(t, "state",
		"101 Main St, Springfield MA",
		"101 Main St, Springfield IL")
	differentKey(t, "street name",
		"101 Main St, Saugus MA",
		"101 Oak St, Saugus MA")
	differentKey(t, "unit number",
		"203 Essex St Apt 4, Saugus MA",
		"203 Essex St Apt 5, Saugus MA")
	differentKey(t, "directional prefix is meaningful",
		"12 N Main St, Saugus MA",
		"12 S Main St, Saugus MA")
}

func TestNormalizeAddressKey_EmptyInput(t *testing.T) {
	for _, in := range []string{"", "   ", "\n\t", ",,,", "- . -"} {
		if got := NormalizeAddressKey(in); got != "" {
			t.Errorf("NormalizeAddressKey(%q) = %q, want empty", in, got)
		}
	}
}

// Stability matters as much as correctness: the key is a UNIQUE column, so a
// normalizer that is not idempotent would let the same address insert twice
// after a round trip through the database.
func TestNormalizeAddressKey_IsIdempotent(t *testing.T) {
	for _, in := range []string{
		"101 Main St, Saugus, MA 01906",
		"39 Bridle Ridge Dr, North Grafton, MA 01536",
		"12 Đường Lê Lợi, Saigon",
		"203 Essex St #4, Saugus MA",
		"8 Elm St, Hartford, CT",
	} {
		once := NormalizeAddressKey(in)
		if twice := NormalizeAddressKey(once); twice != once {
			t.Errorf("NormalizeAddressKey(%q) = %q, but re-normalizing gives %q", in, once, twice)
		}
	}
}

// The five addresses on the church's May paper calendar, which is the artifact
// this whole feature is reproducing. Four distinct places; the church building
// is reached by several differently-worded events.
func TestNormalizeAddressKey_MayCalendar(t *testing.T) {
	church := NormalizeAddressKey("101 Main St, Saugus, MA 01906")
	for _, variant := range []string{
		"101 Main Street, Saugus, MA 01906",
		"101 main st, saugus, ma",
		"101 Main St.\nSaugus, MA",
	} {
		if got := NormalizeAddressKey(variant); got != church {
			t.Errorf("church address variant %q -> %q, want %q", variant, got, church)
		}
	}

	others := map[string]string{
		"youth camp":   "1414 Plank Road, Hooversville, PA 15936",
		"chris & sebs": "39 Bridle Ridge Dr, North Grafton, MA 01536",
		"mst house":    "203 Essex Street, Saugus MA 01906",
	}
	seen := map[string]string{church: "church"}
	for name, addr := range others {
		key := NormalizeAddressKey(addr)
		if prev, dup := seen[key]; dup {
			t.Errorf("%s collided with %s on key %q", name, prev, key)
		}
		seen[key] = name
	}
	if len(seen) != 4 {
		t.Errorf("expected 4 distinct places from the May calendar, got %d", len(seen))
	}
}
