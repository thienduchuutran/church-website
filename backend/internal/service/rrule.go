package service

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// This file is the recurrence vocabulary: how a repeat rule is written down,
// read back, and turned into dates.
//
// Rules are stored as RFC 5545 RRULE text (FREQ=MONTHLY;BYDAY=1SU) rather than
// a private format. Two reasons, neither of them purity. It is the string an
// .ics feed would need if the church ever asks to subscribe to the calendar on
// their phones - the one scenario DECISIONS.md names as able to expire the
// whole storage decision - so writing it now costs nothing and removes a
// rewrite later. And it is a format with an existing spec to check behaviour
// against instead of inventing answers.
//
// What this is NOT is an RFC 5545 implementation. We support the subset below
// and reject everything else at the write path, so the database can never hold
// a rule the generator would mis-handle. That containment is deliberate: the
// spec's recurrence section runs dozens of pages, and a rule we can store but
// not expand correctly is worse than one we refuse.
//
// Crucially, none of this runs when somebody looks at the calendar. Occurrences
// are generated once, on save, and stored as ordinary rows. Adding rule kinds
// costs generator complexity and nothing at all on the read path - which is why
// richer rules did not reverse the decision to store rows.

const (
	// maxExpansion bounds one expansion regardless of what the rule says. A
	// daily rule over three years is ~1100 dates; Mon/Wed/Fri weekly is ~470.
	// This sits above both and below anything that would be a mistake.
	maxExpansion = 1200

	// maxIterations stops a rule that produces nothing from spinning forever -
	// BYMONTHDAY=31 skipping short months, say. Counted in candidate periods,
	// not emitted dates.
	maxIterations = 20000
)

// RRule is the supported subset of an RFC 5545 recurrence rule.
type RRule struct {
	// Freq is DAILY, WEEKLY, MONTHLY or YEARLY.
	Freq string
	// Interval is "every N of Freq". Always >= 1 once parsed.
	Interval int
	// ByDay selects weekdays. For WEEKLY these are plain weekdays (MO,WE,FR).
	// For MONTHLY a single ordinal token picks the nth weekday of the month
	// (1SU = first Sunday, -1SU = last Sunday).
	ByDay []DayToken
	// ByMonthDay is a day-of-month for MONTHLY rules. 0 means unset, in which
	// case the start date's own day is used.
	ByMonthDay int
	// Count ends the series after this many occurrences IN TOTAL, the first one
	// included. 0 means unset. Mutually exclusive with an "ends on" date, which
	// is stored in its own column rather than in the rule - see
	// recurrence_until in migration 000015.
	Count int
}

// DayToken is one BYDAY entry: a weekday, optionally with an ordinal.
type DayToken struct {
	Ordinal int // 0 = no ordinal
	Weekday time.Weekday
}

var weekdayCodes = map[string]time.Weekday{
	"SU": time.Sunday, "MO": time.Monday, "TU": time.Tuesday, "WE": time.Wednesday,
	"TH": time.Thursday, "FR": time.Friday, "SA": time.Saturday,
}

var weekdayNames = map[time.Weekday]string{
	time.Sunday: "SU", time.Monday: "MO", time.Tuesday: "TU", time.Wednesday: "WE",
	time.Thursday: "TH", time.Friday: "FR", time.Saturday: "SA",
}

var supportedFreq = map[string]bool{"DAILY": true, "WEEKLY": true, "MONTHLY": true, "YEARLY": true}

// ParseRRule reads a stored rule string. It is strict on purpose: anything it
// does not understand is an error rather than a silently ignored part, because
// ignoring a BYSETPOS would produce a series that is confidently wrong on the
// public calendar.
func ParseRRule(s string) (RRule, error) {
	r := RRule{Interval: 1}
	s = strings.TrimSpace(strings.ToUpper(s))
	if s == "" {
		return r, fmt.Errorf("empty recurrence rule")
	}
	// Tolerate the "RRULE:" prefix an .ics line would carry.
	s = strings.TrimPrefix(s, "RRULE:")

	for _, part := range strings.Split(s, ";") {
		if part == "" {
			continue
		}
		key, value, ok := strings.Cut(part, "=")
		if !ok {
			return r, fmt.Errorf("malformed rule part: %s", part)
		}
		switch key {
		case "FREQ":
			if !supportedFreq[value] {
				return r, fmt.Errorf("unsupported FREQ: %s", value)
			}
			r.Freq = value
		case "INTERVAL":
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 {
				return r, fmt.Errorf("invalid INTERVAL: %s", value)
			}
			r.Interval = n
		case "COUNT":
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 {
				return r, fmt.Errorf("invalid COUNT: %s", value)
			}
			r.Count = n
		case "BYMONTHDAY":
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 || n > 31 {
				return r, fmt.Errorf("invalid BYMONTHDAY: %s", value)
			}
			r.ByMonthDay = n
		case "BYDAY":
			for _, tok := range strings.Split(value, ",") {
				d, err := parseDayToken(tok)
				if err != nil {
					return r, err
				}
				r.ByDay = append(r.ByDay, d)
			}
		default:
			// UNTIL is deliberately rejected here: the "ends on" date lives in
			// the recurrence_until column so the admin panel can ask whether a
			// series is finished without parsing every rule.
			return r, fmt.Errorf("unsupported rule part: %s", key)
		}
	}

	if r.Freq == "" {
		return r, fmt.Errorf("rule has no FREQ")
	}
	if err := r.validateCombination(); err != nil {
		return r, err
	}
	return r, nil
}

// validateCombination rejects rules whose parts contradict each other. These
// are the cases that would otherwise expand into something the admin did not
// ask for, which is worse than an error message.
func (r RRule) validateCombination() error {
	switch r.Freq {
	case "WEEKLY":
		for _, d := range r.ByDay {
			if d.Ordinal != 0 {
				return fmt.Errorf("BYDAY ordinals are not allowed on a weekly rule")
			}
		}
		if r.ByMonthDay != 0 {
			return fmt.Errorf("BYMONTHDAY is not allowed on a weekly rule")
		}
	case "MONTHLY":
		if r.ByMonthDay != 0 && len(r.ByDay) > 0 {
			return fmt.Errorf("a monthly rule takes BYMONTHDAY or BYDAY, not both")
		}
		if len(r.ByDay) > 1 {
			return fmt.Errorf("a monthly rule takes at most one BYDAY entry")
		}
		if len(r.ByDay) == 1 && r.ByDay[0].Ordinal == 0 {
			return fmt.Errorf("a monthly BYDAY needs an ordinal, e.g. 1SU or -1SU")
		}
	case "DAILY", "YEARLY":
		if len(r.ByDay) > 0 || r.ByMonthDay != 0 {
			return fmt.Errorf("%s rules take no BYDAY or BYMONTHDAY", r.Freq)
		}
	}
	return nil
}

func parseDayToken(tok string) (DayToken, error) {
	tok = strings.TrimSpace(tok)
	if len(tok) < 2 {
		return DayToken{}, fmt.Errorf("invalid BYDAY: %s", tok)
	}
	code := tok[len(tok)-2:]
	wd, ok := weekdayCodes[code]
	if !ok {
		return DayToken{}, fmt.Errorf("invalid weekday in BYDAY: %s", tok)
	}
	d := DayToken{Weekday: wd}
	if prefix := tok[:len(tok)-2]; prefix != "" {
		n, err := strconv.Atoi(prefix)
		if err != nil || n == 0 || n < -5 || n > 5 {
			return DayToken{}, fmt.Errorf("invalid BYDAY ordinal: %s", tok)
		}
		d.Ordinal = n
	}
	return d, nil
}

// String renders the canonical form, so a rule that round-trips through the
// database comes back byte-identical and a stored rule can be compared to a
// submitted one without re-parsing both.
func (r RRule) String() string {
	parts := []string{"FREQ=" + r.Freq}
	if r.Interval > 1 {
		parts = append(parts, "INTERVAL="+strconv.Itoa(r.Interval))
	}
	if len(r.ByDay) > 0 {
		toks := make([]string, 0, len(r.ByDay))
		for _, d := range r.ByDay {
			if d.Ordinal != 0 {
				toks = append(toks, strconv.Itoa(d.Ordinal)+weekdayNames[d.Weekday])
			} else {
				toks = append(toks, weekdayNames[d.Weekday])
			}
		}
		parts = append(parts, "BYDAY="+strings.Join(toks, ","))
	}
	if r.ByMonthDay != 0 {
		parts = append(parts, "BYMONTHDAY="+strconv.Itoa(r.ByMonthDay))
	}
	if r.Count != 0 {
		parts = append(parts, "COUNT="+strconv.Itoa(r.Count))
	}
	return strings.Join(parts, ";")
}

// ExpandRRule returns every date the rule produces from start, in order,
// including start itself.
//
// Bounds, whichever bites first: the rule's COUNT, the "ends on" date, the
// horizon, and the hard expansion cap. Returning the whole series including its
// first date - rather than "everything after X" - is what lets COUNT mean what
// it says: the anchor is the first of the N.
func ExpandRRule(start time.Time, r RRule, until *time.Time, horizon time.Time) ([]time.Time, error) {
	if r.Interval < 1 {
		r.Interval = 1
	}
	var out []time.Time

	emit := func(d time.Time) bool {
		if d.Before(start) {
			return true // before the series began; keep looking
		}
		if until != nil && d.After(*until) {
			return false
		}
		if d.After(horizon) {
			return false
		}
		out = append(out, d)
		if r.Count > 0 && len(out) >= r.Count {
			return false
		}
		return len(out) < maxExpansion
	}

	switch r.Freq {
	case "DAILY":
		for i := 0; i < maxIterations; i++ {
			if !emit(start.AddDate(0, 0, i*r.Interval)) {
				return out, nil
			}
		}
	case "WEEKLY":
		days := r.ByDay
		if len(days) == 0 {
			days = []DayToken{{Weekday: start.Weekday()}}
		}
		offsets := weekOffsets(start, days)
		// Align to the Sunday of the start's week so "every 2 weeks" steps
		// whole weeks rather than drifting off the start weekday.
		weekStart := start.AddDate(0, 0, -int(start.Weekday()))
		for w := 0; w < maxIterations; w++ {
			base := weekStart.AddDate(0, 0, 7*w*r.Interval)
			for _, off := range offsets {
				if !emit(base.AddDate(0, 0, off)) {
					return out, nil
				}
			}
		}
	case "MONTHLY":
		first := time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, start.Location())
		for m := 0; m < maxIterations; m++ {
			month := addMonths(first, m*r.Interval)
			d, ok := monthlyDate(month, start, r)
			if !ok {
				continue // this month has no matching date; try the next
			}
			if !emit(d) {
				return out, nil
			}
		}
	case "YEARLY":
		for y := 0; y < maxIterations; y++ {
			if !emit(yearlyOccurrence(start, start.Year()+y*r.Interval)) {
				return out, nil
			}
		}
	default:
		return nil, fmt.Errorf("unsupported FREQ: %s", r.Freq)
	}
	return out, nil
}

// weekOffsets converts the selected weekdays into day offsets from the Sunday
// of a week, sorted, so each week emits its dates in calendar order.
func weekOffsets(start time.Time, days []DayToken) []int {
	seen := map[int]bool{}
	var offs []int
	for _, d := range days {
		o := int(d.Weekday)
		if !seen[o] {
			seen[o] = true
			offs = append(offs, o)
		}
	}
	sort.Ints(offs)
	return offs
}

// monthlyDate places one occurrence inside a month.
//
// The clamping choice mirrors the February 29 decision already made for yearly
// birthdays: an event set for the 31st happens on the last day of a shorter
// month rather than skipping that month entirely. The calendar standard skips;
// we clamp, for the same reason a leap-day birthday is greeted on the 28th -
// a monthly event that silently misses February is a meeting nobody was told
// was cancelled.
//
// An nth-weekday rule (1SU, -1SU) is different: "the fifth Sunday" genuinely
// does not exist in most months, and inventing one would move the event to a
// week the admin did not choose. Those months are skipped, and ok is false.
func monthlyDate(month time.Time, start time.Time, r RRule) (time.Time, bool) {
	if len(r.ByDay) == 1 {
		return nthWeekdayOfMonth(month, r.ByDay[0])
	}
	day := r.ByMonthDay
	if day == 0 {
		day = start.Day()
	}
	last := daysInMonth(month.Year(), month.Month())
	if day > last {
		day = last
	}
	return time.Date(month.Year(), month.Month(), day, 0, 0, 0, 0, start.Location()), true
}

// nthWeekdayOfMonth resolves tokens like 1SU (first Sunday) and -1SU (last
// Sunday). Returns false when the month has no such occurrence, which is the
// honest answer for "the fifth Monday" in most months.
func nthWeekdayOfMonth(month time.Time, d DayToken) (time.Time, bool) {
	year, mon := month.Year(), month.Month()
	last := daysInMonth(year, mon)

	if d.Ordinal > 0 {
		first := time.Date(year, mon, 1, 0, 0, 0, 0, month.Location())
		offset := (int(d.Weekday) - int(first.Weekday()) + 7) % 7
		day := 1 + offset + (d.Ordinal-1)*7
		if day > last {
			return time.Time{}, false
		}
		return time.Date(year, mon, day, 0, 0, 0, 0, month.Location()), true
	}

	lastDay := time.Date(year, mon, last, 0, 0, 0, 0, month.Location())
	offset := (int(lastDay.Weekday()) - int(d.Weekday) + 7) % 7
	day := last - offset + (d.Ordinal+1)*7
	if day < 1 {
		return time.Time{}, false
	}
	return time.Date(year, mon, day, 0, 0, 0, 0, month.Location()), true
}

// addMonths steps whole months without Go's AddDate day-overflow, which would
// turn January 31 plus one month into March 3. Callers always pass the first of
// a month, so this only ever has to move the month and year.
func addMonths(firstOfMonth time.Time, n int) time.Time {
	total := int(firstOfMonth.Month()) - 1 + n
	year := firstOfMonth.Year() + total/12
	mon := total % 12
	if mon < 0 {
		mon += 12
		year--
	}
	return time.Date(year, time.Month(mon+1), 1, 0, 0, 0, 0, firstOfMonth.Location())
}

func daysInMonth(year int, m time.Month) int {
	return time.Date(year, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
