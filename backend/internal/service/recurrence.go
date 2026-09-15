package service

import (
	"fmt"
	"time"
)

const (
	// recurrenceHorizonYears is how far ahead an OPEN-ENDED series is generated.
	// Three years is long enough that nobody is nagged often and short enough
	// that a mistake is cheap to delete. A series bounded by an "ends on" date
	// or a COUNT is generated to that bound instead and never needs extending -
	// see DECISIONS.md (2026-09-14).
	recurrenceHorizonYears = 3
)

// OccurrencesForCreate returns every date a new series should write BESIDES the
// anchor's own, formatted YYYY-MM-DD.
//
// The anchor is excluded because the caller already has it: it is the row the
// admin filled in, and returning it here would write the first date twice.
// Note that it still COUNTS - a rule saying "repeat 4 times" produces the
// anchor plus three, because four is what the admin asked to see on the
// calendar.
func OccurrencesForCreate(start time.Time, ruleText string, until *time.Time) ([]string, error) {
	return occurrencesAfter(start, ruleText, until, start, start)
}

// OccurrencesForExtend returns the dates a series should gain when its horizon
// is topped up, given the furthest occurrence it already has.
//
// The rule is still applied from the ORIGINAL start - a birthday has to keep
// landing on its real day, and a fortnightly meeting has to stay on its
// weekday - while the horizon moves with the extension so each top-up buys
// another three years rather than returning nothing because the original
// window closed long ago.
//
// A COUNT-bounded series returns nothing once its occurrences all exist, which
// is what makes the admin panel's "extend" button correctly do nothing for a
// series that is simply finished.
func OccurrencesForExtend(start time.Time, ruleText string, until *time.Time, last time.Time) ([]string, error) {
	return occurrencesAfter(start, ruleText, until, last, last)
}

// occurrencesAfter is the shared body: expand the whole series from its start,
// then keep only what falls after the bound.
//
// Expanding from the start every time rather than continuing from the last
// stored row is deliberate. It is what keeps COUNT meaning "this many in total"
// instead of "this many more", and it is what stops a February 29 birthday that
// fell back to the 28th one year from repeating the 28th forever. Every
// occurrence is derived from the date the admin actually chose.
func occurrencesAfter(start time.Time, ruleText string, until *time.Time, after time.Time, horizonFrom time.Time) ([]string, error) {
	rule, err := ParseRRule(ruleText)
	if err != nil {
		return nil, err
	}
	all, err := ExpandRRule(start, rule, until, horizonFrom.AddDate(recurrenceHorizonYears, 0, 0))
	if err != nil {
		return nil, err
	}
	var out []string
	for _, d := range all {
		if !d.After(after) {
			continue // already exists as a row
		}
		out = append(out, d.Format("2006-01-02"))
	}
	return out, nil
}

// DescribeRRule renders a rule in plain English for a log line or an admin
// panel that has only the stored string to work with. Not used for the edit
// form, which keeps the admin's own selections - this is for the places where
// all we have is what the database holds.
func DescribeRRule(ruleText string) string {
	r, err := ParseRRule(ruleText)
	if err != nil {
		return ruleText
	}
	every := "every "
	if r.Interval > 1 {
		every = fmt.Sprintf("every %d ", r.Interval)
	}
	switch r.Freq {
	case "DAILY":
		return every + plural("day", r.Interval)
	case "WEEKLY":
		if len(r.ByDay) > 0 {
			names := make([]string, 0, len(r.ByDay))
			for _, d := range r.ByDay {
				names = append(names, d.Weekday.String())
			}
			return every + plural("week", r.Interval) + " on " + joinWords(names)
		}
		return every + plural("week", r.Interval)
	case "MONTHLY":
		if len(r.ByDay) == 1 {
			return every + plural("month", r.Interval) + " on the " + ordinalWord(r.ByDay[0].Ordinal) + " " + r.ByDay[0].Weekday.String()
		}
		if r.ByMonthDay > 0 {
			return fmt.Sprintf("%s%s on day %d", every, plural("month", r.Interval), r.ByMonthDay)
		}
		return every + plural("month", r.Interval)
	case "YEARLY":
		return every + plural("year", r.Interval)
	}
	return ruleText
}

func plural(word string, n int) string {
	if n > 1 {
		return word + "s"
	}
	return word
}

func ordinalWord(n int) string {
	switch n {
	case 1:
		return "first"
	case 2:
		return "second"
	case 3:
		return "third"
	case 4:
		return "fourth"
	case 5:
		return "fifth"
	case -1:
		return "last"
	}
	return fmt.Sprint(n)
}

func joinWords(items []string) string {
	switch len(items) {
	case 0:
		return ""
	case 1:
		return items[0]
	case 2:
		return items[0] + " and " + items[1]
	}
	out := ""
	for i, s := range items[:len(items)-1] {
		if i > 0 {
			out += ", "
		}
		out += s
	}
	return out + " and " + items[len(items)-1]
}

// yearlyOccurrence places an anniversary of start in the given year.
//
// The February 29 rule is a decision, not arithmetic: a member born on a leap
// day is greeted on February 28 in ordinary years rather than every fourth
// year. The calendar standard does the opposite - February 29 simply does not
// occur in an ordinary year - and it is correct in the sense that matters to a
// specification and wrong in the sense that matters to a congregation of a
// hundred people who know each other by name.
//
// Go's own AddDate would do a third thing, rolling February 29 forward to
// March 1, which is the only option nobody would defend. That is why this
// function exists rather than a one-line call.
func yearlyOccurrence(start time.Time, year int) time.Time {
	day := start.Day()
	if start.Month() == time.February && day == 29 && !isLeapYear(year) {
		day = 28
	}
	return time.Date(year, start.Month(), day, 0, 0, 0, 0, start.Location())
}

// isLeapYear implements the full Gregorian rule, including the century
// exception that makes 1900 an ordinary year and 2000 a leap one.
func isLeapYear(y int) bool {
	return y%4 == 0 && (y%100 != 0 || y%400 == 0)
}
