package service

import (
	"testing"
	"time"
)

func expand(t *testing.T, startStr, rule string, untilStr string, horizonStr string) []string {
	t.Helper()
	r, err := ParseRRule(rule)
	if err != nil {
		t.Fatalf("parse %q: %v", rule, err)
	}
	var until *time.Time
	if untilStr != "" {
		u := mustDate(t, untilStr)
		until = &u
	}
	dates, err := ExpandRRule(mustDate(t, startStr), r, until, mustDate(t, horizonStr))
	if err != nil {
		t.Fatalf("expand %q: %v", rule, err)
	}
	out := make([]string, len(dates))
	for i, d := range dates {
		out[i] = d.Format("2006-01-02")
	}
	return out
}

func eq(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %d dates %v, want %d %v", len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("index %d: got %s, want %s", i, got[i], want[i])
		}
	}
}

// The anchor's own date is the first occurrence. COUNT counts it, which is what
// "repeat 4 times" means to the person typing it.
func TestExpandIncludesTheStartAndHonoursCount(t *testing.T) {
	got := expand(t, "2026-09-04", "FREQ=WEEKLY;COUNT=4", "", "2030-01-01")
	eq(t, got, []string{"2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"})
}

// Mon/Wed/Fri: several dates per period, emitted in calendar order, and never
// before the start even though Monday of that week precedes it.
func TestExpandWeeklyByDayStaysInCalendarOrder(t *testing.T) {
	// 2026-09-04 is a Friday.
	got := expand(t, "2026-09-04", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5", "", "2030-01-01")
	eq(t, got, []string{"2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14"})
}

// "Every two weeks" must step whole weeks from the start's own week rather than
// drifting onto a different weekday.
func TestExpandWeeklyIntervalKeepsTheWeekday(t *testing.T) {
	got := expand(t, "2026-09-04", "FREQ=WEEKLY;INTERVAL=2;COUNT=3", "", "2030-01-01")
	eq(t, got, []string{"2026-09-04", "2026-09-18", "2026-10-02"})
	for _, d := range got {
		if mustDate(t, d).Weekday() != time.Friday {
			t.Errorf("%s is not a Friday - the interval drifted", d)
		}
	}
}

// First Sunday of the month, the shape a church actually schedules by.
func TestExpandMonthlyNthWeekday(t *testing.T) {
	got := expand(t, "2026-09-06", "FREQ=MONTHLY;BYDAY=1SU;COUNT=4", "", "2030-01-01")
	eq(t, got, []string{"2026-09-06", "2026-10-04", "2026-11-01", "2026-12-06"})
}

// Last Sunday, which is a different date from "the fourth Sunday" in any month
// with five of them - the case a naive implementation gets wrong.
func TestExpandMonthlyLastWeekday(t *testing.T) {
	got := expand(t, "2026-09-27", "FREQ=MONTHLY;BYDAY=-1SU;COUNT=3", "", "2030-01-01")
	eq(t, got, []string{"2026-09-27", "2026-10-25", "2026-11-29"})
}

// A fifth Monday genuinely does not exist most months. Skipping is correct -
// inventing one would move a meeting to a week nobody chose.
func TestExpandMonthlyFifthWeekdaySkipsMonthsWithoutOne(t *testing.T) {
	got := expand(t, "2026-03-30", "FREQ=MONTHLY;BYDAY=5MO;COUNT=3", "", "2030-01-01")
	for _, d := range got {
		day := mustDate(t, d)
		if day.Weekday() != time.Monday {
			t.Errorf("%s is not a Monday", d)
		}
		if day.Day() < 29 {
			t.Errorf("%s is not a fifth Monday", d)
		}
	}
	if len(got) < 2 {
		t.Fatalf("expected the rule to find later fifth Mondays, got %v", got)
	}
}

// Day-of-month clamps rather than skipping, matching the February 29 decision:
// a monthly event that silently misses a month is a meeting nobody was told was
// cancelled.
func TestExpandMonthlyByMonthDayClampsToShortMonths(t *testing.T) {
	got := expand(t, "2026-01-31", "FREQ=MONTHLY;BYMONTHDAY=31;COUNT=4", "", "2030-01-01")
	eq(t, got, []string{"2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"})
}

// The leap-day rule from the original decision must survive the rewrite.
func TestExpandYearlyKeepsTheLeapDayPolicy(t *testing.T) {
	got := expand(t, "2028-02-29", "FREQ=YEARLY;COUNT=5", "", "2040-01-01")
	eq(t, got, []string{"2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"})
}

// An "ends on" date bounds the series even when COUNT would allow more.
func TestExpandStopsAtUntilBeforeCount(t *testing.T) {
	got := expand(t, "2026-09-04", "FREQ=WEEKLY;COUNT=10", "2026-09-18", "2030-01-01")
	eq(t, got, []string{"2026-09-04", "2026-09-11", "2026-09-18"})
}

// An open-ended rule stops at the horizon instead of running away.
func TestExpandStopsAtHorizon(t *testing.T) {
	got := expand(t, "2026-01-01", "FREQ=DAILY", "", "2026-01-10")
	if len(got) != 10 {
		t.Fatalf("got %d dates, want 10: %v", len(got), got)
	}
}

func TestParseRRuleRoundTrips(t *testing.T) {
	for _, in := range []string{
		"FREQ=WEEKLY",
		"FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR",
		"FREQ=MONTHLY;BYDAY=1SU",
		"FREQ=MONTHLY;BYMONTHDAY=15;COUNT=6",
		"FREQ=YEARLY",
	} {
		r, err := ParseRRule(in)
		if err != nil {
			t.Fatalf("parse %q: %v", in, err)
		}
		if got := r.String(); got != in {
			t.Errorf("round trip of %q produced %q", in, got)
		}
	}
}

// Rejecting rather than ignoring is the whole containment strategy: a rule we
// can store but cannot expand correctly would render confidently wrong dates on
// the public calendar.
func TestParseRRuleRejectsWhatItCannotExpand(t *testing.T) {
	for _, bad := range []string{
		"",
		"FREQ=HOURLY",
		"FREQ=WEEKLY;BYSETPOS=1",
		"FREQ=WEEKLY;UNTIL=20261231",
		"FREQ=WEEKLY;BYDAY=1SU",
		"FREQ=MONTHLY;BYDAY=SU",
		"FREQ=MONTHLY;BYMONTHDAY=15;BYDAY=1SU",
		"FREQ=MONTHLY;BYDAY=1SU,2MO",
		"FREQ=YEARLY;BYDAY=MO",
		"FREQ=WEEKLY;INTERVAL=0",
		"FREQ=WEEKLY;COUNT=0",
		"FREQ=WEEKLY;BYDAY=XX",
		"NOTAPART",
	} {
		if _, err := ParseRRule(bad); err == nil {
			t.Errorf("ParseRRule(%q) was accepted; it should be rejected", bad)
		}
	}
}

func TestAddMonthsDoesNotOverflowDays(t *testing.T) {
	jan := mustDate(t, "2026-01-01")
	got := addMonths(jan, 13).Format("2006-01-02")
	if got != "2027-02-01" {
		t.Errorf("addMonths(Jan 2026, 13) = %s, want 2027-02-01", got)
	}
}
