package service

import (
	"testing"
	"time"
)

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatalf("bad test date %q: %v", s, err)
	}
	return d
}

// A leap-day birthday is the case the whole February rule exists for, and the
// thing that must NOT happen is the one Go's AddDate would do on its own:
// rolling the date into March. Checked across a full leap cycle so the
// every-fourth-year exception is exercised rather than assumed.
func TestYearlyOccurrenceLeapDayFallsBackToFeb28(t *testing.T) {
	start := mustDate(t, "2028-02-29")
	for _, tc := range []struct {
		year int
		want string
	}{
		{2029, "2029-02-28"},
		{2030, "2030-02-28"},
		{2031, "2031-02-28"},
		{2032, "2032-02-29"}, // leap again, the real birthday returns
	} {
		if got := yearlyOccurrence(start, tc.year).Format("2006-01-02"); got != tc.want {
			t.Errorf("year %d: got %s, want %s", tc.year, got, tc.want)
		}
	}
}

// Drift is the failure this design guards against: if each occurrence were
// computed from the previous one, the 2029 fallback to the 28th would make
// every later year the 28th too, and the member would permanently lose their
// real birthday. Deriving from the original start date is what prevents it.
func TestYearlyOccurrenceDoesNotDriftAfterAFallback(t *testing.T) {
	start := mustDate(t, "2028-02-29")
	dates, err := OccurrencesForCreate(start, "FREQ=YEARLY", nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	want := []string{"2029-02-28", "2030-02-28", "2031-02-28"}
	if len(dates) != len(want) {
		t.Fatalf("got %d dates %v, want %d", len(dates), dates, len(want))
	}
	for i := range want {
		if dates[i] != want[i] {
			t.Errorf("index %d: got %s, want %s", i, dates[i], want[i])
		}
	}
}

func TestIsLeapYearCenturyRule(t *testing.T) {
	for _, tc := range []struct {
		y    int
		want bool
	}{
		{2024, true}, {2025, false}, {1900, false}, {2000, true}, {2100, false},
	} {
		if got := isLeapYear(tc.y); got != tc.want {
			t.Errorf("isLeapYear(%d) = %v, want %v", tc.y, got, tc.want)
		}
	}
}

// The anchor's own date must never come back, or the series would be written
// twice - once by the anchor insert and once by the occurrence insert.
func TestGenerateOccurrencesExcludesTheAnchorDate(t *testing.T) {
	start := mustDate(t, "2026-03-03")
	dates, err := OccurrencesForCreate(start, "FREQ=YEARLY", nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	for _, d := range dates {
		if d == "2026-03-03" {
			t.Fatalf("anchor date %s was generated as an occurrence: %v", d, dates)
		}
	}
}

// An explicit "ends on" date is the bound, and nothing past it is generated -
// this is what makes a fixed-term series never need the horizon or its warning.
func TestGenerateOccurrencesStopsAtUntil(t *testing.T) {
	start := mustDate(t, "2026-09-04") // a Friday
	until := mustDate(t, "2026-10-02")
	dates, err := OccurrencesForCreate(start, "FREQ=WEEKLY", &until)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	want := []string{"2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"}
	if len(dates) != len(want) {
		t.Fatalf("got %v, want %v", dates, want)
	}
	for i := range want {
		if dates[i] != want[i] {
			t.Errorf("index %d: got %s, want %s", i, dates[i], want[i])
		}
	}
}

// An open-ended weekly series stops at the horizon rather than running away,
// and stays under the hard cap that protects against a mistyped end date.
func TestGenerateOccurrencesRespectsHorizonAndCap(t *testing.T) {
	start := mustDate(t, "2026-01-02")
	dates, err := OccurrencesForCreate(start, "FREQ=WEEKLY", nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if len(dates) > maxExpansion {
		t.Fatalf("generated %d occurrences, cap is %d", len(dates), maxExpansion)
	}
	last := mustDate(t, dates[len(dates)-1])
	horizon := start.AddDate(recurrenceHorizonYears, 0, 0)
	if last.After(horizon) {
		t.Errorf("last occurrence %s is past the %d-year horizon %s",
			last.Format("2006-01-02"), recurrenceHorizonYears, horizon.Format("2006-01-02"))
	}
}

func TestGenerateOccurrencesRejectsUnknownRule(t *testing.T) {
	if _, err := OccurrencesForCreate(mustDate(t, "2026-01-01"), "FREQ=FORTNIGHTLY", nil); err == nil {
		t.Fatal("expected an error for an unsupported rule, got nil")
	}
}

// Extending a series must keep using the ORIGINAL start date to place
// occurrences - a birthday has to stay on its real day - while only generating
// the ones past what is already stored. Re-deriving from the last written row
// instead would slide a weekly series onto a different weekday over time.
func TestGenerateOccurrencesAfterContinuesFromTheOriginalRule(t *testing.T) {
	start := mustDate(t, "2026-03-03")
	last := mustDate(t, "2029-03-03")
	dates, err := OccurrencesForExtend(start, "FREQ=YEARLY", nil, last)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if len(dates) == 0 {
		t.Fatal("extending produced no new occurrences")
	}
	if dates[0] != "2030-03-03" {
		t.Errorf("first extended date = %s, want 2030-03-03", dates[0])
	}
	for _, d := range dates {
		if !mustDate(t, d).After(last) {
			t.Errorf("%s is not after the last stored occurrence %s", d, last.Format("2006-01-02"))
		}
	}
}

// A finished series - one whose end date has already been reached - must
// produce nothing when extended, or the admin panel would offer a button that
// silently does nothing useful.
func TestGenerateOccurrencesAfterStopsAtAFinishedSeries(t *testing.T) {
	start := mustDate(t, "2026-09-04")
	until := mustDate(t, "2026-10-02")
	dates, err := OccurrencesForExtend(start, "FREQ=WEEKLY", &until, until)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if len(dates) != 0 {
		t.Errorf("finished series generated %v, want none", dates)
	}
}
