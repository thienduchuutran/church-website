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

// The actual production case: 2026 entries were written "X's Birthday" and
// 2027 entries just "X", which left one member looking like two people.
func TestGroupRowsMergesTheTwoNamingConventions(t *testing.T) {
	groups := groupRows([]row{
		{ID: "a", Date: d(t, "2026-03-03"), Title: "Huy's Birthday"},
		{ID: "b", Date: d(t, "2027-03-03"), Title: "Huy"},
	})
	if len(groups) != 1 {
		t.Fatalf("got %d groups, want 1 - the two naming styles must merge", len(groups))
	}
	if groups[0].Rows[0].ID != "a" {
		t.Errorf("anchor = %s, want a (the earliest row)", groups[0].Rows[0].ID)
	}
	// The newest wording is the house style and becomes the series title, even
	// though the OLDEST row is the anchor.
	if groups[0].Title != "Huy" {
		t.Errorf("series title = %q, want \"Huy\"", groups[0].Title)
	}
}

// Stripping happens only at the end of the title, so a member whose name
// contains the word is untouched.
func TestStripBirthdaySuffixOnlyTrims(t *testing.T) {
	for in, want := range map[string]string{
		"huy's birthday":  "huy",
		"huy’s birthday":  "huy", // curly apostrophe, which phones produce
		"davids birthday": "davids",
		"huy birthday":    "huy",
		"huy":             "huy",
		"birthday nguyen": "birthday nguyen",
	} {
		if got := stripBirthdaySuffix(in); got != want {
			t.Errorf("stripBirthdaySuffix(%q) = %q, want %q", in, got, want)
		}
	}
}

// displayTitle keeps the original capitalisation - it names the series, it does
// not match it.
func TestDisplayTitleKeepsCapitalisation(t *testing.T) {
	if got := displayTitle("David Do's Birthday"); got != "David Do" {
		t.Errorf("displayTitle = %q, want \"David Do\"", got)
	}
}

// The two merges a person decided, which no string rule could reach.
func TestTitleAliasesMergeTheHumanDecidedPairs(t *testing.T) {
	seb := groupRows([]row{
		{ID: "a", Date: d(t, "2026-04-23"), Title: "Sebastian's Birthday"},
		{ID: "b", Date: d(t, "2027-04-23"), Title: "Seb"},
	})
	if len(seb) != 1 {
		t.Fatalf("Seb/Sebastian did not merge: %d groups", len(seb))
	}
	if seb[0].Title != "Seb" {
		t.Errorf("series title = %q, want \"Seb\"", seb[0].Title)
	}

	khang := groupRows([]row{
		{ID: "a", Date: d(t, "2026-06-26"), Title: "Khang's Birthday"},
		{ID: "b", Date: d(t, "2027-06-26"), Title: "Khang Le"},
	})
	if len(khang) != 1 {
		t.Fatalf("Khang/Khang Le did not merge: %d groups", len(khang))
	}
	if khang[0].Title != "Khang Le" {
		t.Errorf("series title = %q, want \"Khang Le\"", khang[0].Title)
	}
}

// Feb 3 in the real calendar: the 2026 entry names one person, the 2027 entry
// names the household. Confirmed by the owner as a single entry, so they merge
// under the 2027 wording.
func TestTitleAliasMergesTheHouseholdEntry(t *testing.T) {
	groups := groupRows([]row{
		{ID: "a", Date: d(t, "2026-02-03"), Title: "Nha Nghi's Birthday"},
		{ID: "b", Date: d(t, "2027-02-03"), Title: "Hudson/Nha Nghi"},
	})
	if len(groups) != 1 {
		t.Fatalf("got %d groups, want 1 - Feb 3 is one entry", len(groups))
	}
	if groups[0].Title != "Hudson/Nha Nghi" {
		t.Errorf("series title = %q, want \"Hudson/Nha Nghi\"", groups[0].Title)
	}
}

// The guard that matters most: two genuinely different people who share a date
// must survive the new, looser matching. Jason and Thomas are both on Feb 15 in
// the real calendar.
func TestGroupRowsStillSeparatesTwoPeopleOnOneDate(t *testing.T) {
	groups := groupRows([]row{
		{ID: "a", Date: d(t, "2026-02-15"), Title: "Jason's Birthday"},
		{ID: "b", Date: d(t, "2026-02-15"), Title: "Thomas's Birthday"},
	})
	if len(groups) != 2 {
		t.Fatalf("got %d groups, want 2 - Jason and Thomas are different people", len(groups))
	}
}
