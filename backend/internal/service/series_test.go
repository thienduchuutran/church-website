package service

import (
	"testing"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

func at(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatalf("bad date %q: %v", s, err)
	}
	return v
}

func ptr(s string) *string { return &s }

// The warning cannot fire for anything created today - a fresh series gets
// three years of dates and the threshold is twelve months - so these tests are
// the only way to know the rule works before 2029.
func TestNeedsExtension(t *testing.T) {
	now := at(t, "2026-09-15")

	cases := []struct {
		name   string
		series model.CalendarSeries
		want   bool
	}{
		{
			name:   "open-ended series running out inside the window",
			series: model.CalendarSeries{Rule: "FREQ=YEARLY", LastDate: "2027-03-03", Count: 2},
			want:   true,
		},
		{
			name:   "open-ended series with three years still to run",
			series: model.CalendarSeries{Rule: "FREQ=YEARLY", LastDate: "2030-03-03", Count: 5},
			want:   false,
		},
		{
			name:   "series already past its last date is the loudest case of all",
			series: model.CalendarSeries{Rule: "FREQ=YEARLY", LastDate: "2026-01-01", Count: 1},
			want:   true,
		},
		{
			// Stopped because the admin said so. Nagging here would teach them
			// to ignore the warning, which is worse than not having one.
			name:   "finished: generated all the way to its end date",
			series: model.CalendarSeries{Rule: "FREQ=WEEKLY", LastDate: "2026-10-02", Until: ptr("2026-10-02"), Count: 5},
			want:   false,
		},
		{
			// Has an end date but the horizon cut it short, so there is
			// genuinely more to generate.
			name:   "bounded but truncated by the horizon",
			series: model.CalendarSeries{Rule: "FREQ=WEEKLY", LastDate: "2026-10-02", Until: ptr("2035-01-01"), Count: 5},
			want:   true,
		},
		{
			// No end DATE, so it looks open-ended - but extending it can never
			// produce anything, and it would otherwise be flagged forever.
			name:   "finished: COUNT satisfied",
			series: model.CalendarSeries{Rule: "FREQ=WEEKLY;COUNT=4", LastDate: "2026-09-25", Count: 4},
			want:   false,
		},
		{
			name:   "COUNT not yet satisfied",
			series: model.CalendarSeries{Rule: "FREQ=WEEKLY;COUNT=40", LastDate: "2026-09-25", Count: 4},
			want:   true,
		},
		{
			name:   "unreadable date is never nagged about",
			series: model.CalendarSeries{Rule: "FREQ=YEARLY", LastDate: "not-a-date"},
			want:   false,
		},
		{
			// An unparseable rule must not suppress the warning: the dates are
			// what the congregation sees, and they really are running out.
			name:   "unreadable rule still warns on the date",
			series: model.CalendarSeries{Rule: "FREQ=NONSENSE", LastDate: "2027-01-01", Count: 2},
			want:   true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := needsExtension(tc.series, now); got != tc.want {
				t.Errorf("needsExtension = %v, want %v", got, tc.want)
			}
		})
	}
}

// The boundary itself, checked from both sides so the window cannot silently
// widen or narrow in a later edit.
func TestNeedsExtensionBoundary(t *testing.T) {
	now := at(t, "2026-09-15")
	justInside := model.CalendarSeries{Rule: "FREQ=YEARLY", LastDate: "2027-09-14", Count: 2}
	justOutside := model.CalendarSeries{Rule: "FREQ=YEARLY", LastDate: "2027-09-16", Count: 2}

	if !needsExtension(justInside, now) {
		t.Error("a series ending one day inside the twelve-month window was not flagged")
	}
	if needsExtension(justOutside, now) {
		t.Error("a series ending one day outside the window was flagged")
	}
}
