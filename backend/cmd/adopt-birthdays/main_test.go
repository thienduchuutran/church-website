package main

import (
	"testing"
	"time"
)

func d(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatalf("bad date %q: %v", s, err)
	}
	return v
}

// The ordinary case this tool exists for: the same birthday typed by hand for
// two years running, which must come back as ONE series anchored on the
// earlier row.
func TestGroupRowsJoinsTheSameBirthdayAcrossYears(t *testing.T) {
	groups := groupRows([]row{
		{ID: "b", Date: d(t, "2027-03-03"), Title: "Mai's birthday"},
		{ID: "a", Date: d(t, "2026-03-03"), Title: "Mai's birthday"},
	})
	if len(groups) != 1 {
		t.Fatalf("got %d groups, want 1: %+v", len(groups), groups)
	}
	if got := groups[0].Rows[0].ID; got != "a" {
		t.Errorf("anchor = %s, want a (the earliest row)", got)
	}
}

// Sloppy typing should not split one person into two series.
func TestGroupRowsIgnoresCaseAndStrayWhitespace(t *testing.T) {
	groups := groupRows([]row{
		{ID: "a", Date: d(t, "2026-03-03"), Title: "Mai's Birthday"},
		{ID: "b", Date: d(t, "2027-03-03"), Title: "  mai's   birthday "},
	})
	if len(groups) != 1 {
		t.Fatalf("got %d groups, want 1", len(groups))
	}
}

// Two members sharing a date are two series. This is the case the user asked
// about directly, and it works because the title is part of the key.
func TestGroupRowsKeepsDifferentPeopleOnTheSameDateApart(t *testing.T) {
	groups := groupRows([]row{
		{ID: "a", Date: d(t, "2026-03-03"), Title: "Mai's birthday"},
		{ID: "b", Date: d(t, "2026-03-03"), Title: "Hoa's birthday"},
	})
	if len(groups) != 2 {
		t.Fatalf("got %d groups, want 2 - two people who share a birthday must not merge", len(groups))
	}
}

// Diacritics are NOT folded: in a Vietnamese congregation two names differing
// only by an accent can be two different members, and merging them would erase
// one of them silently. Under-grouping is recoverable; a wrong merge is not.
func TestGroupRowsDoesNotFoldDiacritics(t *testing.T) {
	groups := groupRows([]row{
		{ID: "a", Date: d(t, "2026-03-03"), Title: "Hoà's birthday"},
		{ID: "b", Date: d(t, "2026-03-03"), Title: "Hoa's birthday"},
	})
	if len(groups) != 2 {
		t.Fatalf("got %d groups, want 2 - accented and unaccented names must stay separate", len(groups))
	}
	// ...but the report must still put them in front of the admin.
	if flagged := sameDateDifferentTitle(groups); len(flagged) != 1 {
		t.Errorf("same-date spelling difference was not flagged for review")
	}
}

// Same title, same day, same YEAR is the one genuinely ambiguous case: either a
// duplicate entry or two members who share both a name and a birthday. Opposite
// fixes, so the tool must refuse to touch it rather than guess.
func TestSplitByDuplicateYearsRefusesAmbiguousGroups(t *testing.T) {
	groups := groupRows([]row{
		{ID: "a", Date: d(t, "2026-03-03"), Title: "Mai's birthday"},
		{ID: "b", Date: d(t, "2026-03-03"), Title: "Mai's birthday"},
		{ID: "c", Date: d(t, "2026-04-10"), Title: "Hoa's birthday"},
	})
	clean, duplicates := splitByDuplicateYears(groups)
	if len(duplicates) != 1 {
		t.Fatalf("got %d duplicate groups, want 1", len(duplicates))
	}
	if len(clean) != 1 || clean[0].Rows[0].ID != "c" {
		t.Fatalf("the unambiguous group should still be adopted, got %+v", clean)
	}
}

// A birthday entered for one year only is not a problem - it becomes a series
// of one and starts generating from there.
func TestGroupRowsAcceptsASingleYear(t *testing.T) {
	groups := groupRows([]row{{ID: "a", Date: d(t, "2026-07-19"), Title: "Duc's birthday"}})
	clean, duplicates := splitByDuplicateYears(groups)
	if len(clean) != 1 || len(duplicates) != 0 {
		t.Fatalf("a lone birthday should be adopted cleanly, got clean=%d dup=%d", len(clean), len(duplicates))
	}
}

// Generation must continue past the LAST year already typed, so the rows the
// admin already made by hand are never duplicated.
func TestPlannedDatesStartAfterTheLastExistingRow(t *testing.T) {
	g := group{
		Title: "Mai's birthday", Month: time.March, Day: 3,
		Rows: []row{
			{ID: "a", Date: d(t, "2026-03-03"), Title: "Mai's birthday"},
			{ID: "b", Date: d(t, "2027-03-03"), Title: "Mai's birthday"},
		},
	}
	dates, err := plannedDates(g)
	if err != nil {
		t.Fatalf("plannedDates: %v", err)
	}
	if len(dates) == 0 {
		t.Fatal("no future dates planned")
	}
	if dates[0] != "2028-03-03" {
		t.Errorf("first generated date = %s, want 2028-03-03", dates[0])
	}
	for _, x := range dates {
		if x == "2026-03-03" || x == "2027-03-03" {
			t.Errorf("%s already exists as a hand-typed row and would be duplicated", x)
		}
	}
}
