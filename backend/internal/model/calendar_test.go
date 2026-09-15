package model

import "testing"

// validBaseEvent returns a minimal valid single-day create request that each
// test mutates to isolate the end_date rules.
func validBaseEvent() CreateCalendarEventRequest {
	return CreateCalendarEventRequest{
		Date:      "2026-05-22",
		Title:     "Youth Camp",
		EventType: CalendarEventTypeGeneral,
		Icon:      "star",
		Color:     "slate",
	}
}

func TestCreateCalendarEventRequest_Validate_endDate(t *testing.T) {
	t.Run("no end date is valid (single-day, unchanged behaviour)", func(t *testing.T) {
		r := validBaseEvent()
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("end date equal to start is valid", func(t *testing.T) {
		r := validBaseEvent()
		end := "2026-05-22"
		r.EndDate = &end
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("end date after start is valid", func(t *testing.T) {
		r := validBaseEvent()
		end := "2026-05-25"
		r.EndDate = &end
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("end date before start is rejected", func(t *testing.T) {
		r := validBaseEvent()
		end := "2026-05-20"
		r.EndDate = &end
		if err := r.Validate(); err == nil {
			t.Fatal("expected error for end_date before start, got nil")
		}
	})

	t.Run("malformed end date is rejected", func(t *testing.T) {
		r := validBaseEvent()
		end := "not-a-date"
		r.EndDate = &end
		if err := r.Validate(); err == nil {
			t.Fatal("expected error for malformed end_date, got nil")
		}
	})
}

func TestUpdateCalendarEventRequest_Validate_endDate(t *testing.T) {
	t.Run("end before start when both present is rejected", func(t *testing.T) {
		date := "2026-05-22"
		end := "2026-05-20"
		r := UpdateCalendarEventRequest{Date: &date, EndDate: &end}
		if err := r.Validate(); err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("end after start when both present is valid", func(t *testing.T) {
		date := "2026-05-22"
		end := "2026-05-25"
		r := UpdateCalendarEventRequest{Date: &date, EndDate: &end}
		if err := r.Validate(); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("malformed end date is rejected", func(t *testing.T) {
		end := "nope"
		r := UpdateCalendarEventRequest{EndDate: &end}
		if err := r.Validate(); err == nil {
			t.Fatal("expected error for malformed end_date, got nil")
		}
	})
}

// Turning recurrence off has two reasonable meanings - keep the dates already
// created, or also drop the ones still to come - so the request must say which.
// A missing value is rejected rather than defaulted, for the same reason every
// edit and delete carries an explicit scope.
func TestValidateRecurrenceCleanupRequiresAChoiceWhenClearing(t *testing.T) {
	empty := ""
	req := UpdateCalendarEventRequest{Recurrence: &empty}
	if err := req.ValidateRecurrenceCleanup(); err == nil {
		t.Fatal("clearing recurrence without a cleanup mode was accepted; it must be rejected")
	}

	for _, mode := range []string{RecurrenceCleanupKeep, RecurrenceCleanupFuture} {
		m := mode
		req := UpdateCalendarEventRequest{Recurrence: &empty, RecurrenceCleanup: &m}
		if err := req.ValidateRecurrenceCleanup(); err != nil {
			t.Errorf("cleanup mode %q was rejected: %v", mode, err)
		}
	}

	bad := "nuke"
	req = UpdateCalendarEventRequest{Recurrence: &empty, RecurrenceCleanup: &bad}
	if err := req.ValidateRecurrenceCleanup(); err == nil {
		t.Error("an unknown cleanup mode was accepted")
	}
}

// A cleanup mode sent when nothing is being cleared is a client bug, and
// accepting it would let a future change quietly act on it.
func TestValidateRecurrenceCleanupRejectsAStrayMode(t *testing.T) {
	rule := "FREQ=WEEKLY"
	keep := RecurrenceCleanupKeep
	req := UpdateCalendarEventRequest{Recurrence: &rule, RecurrenceCleanup: &keep}
	if err := req.ValidateRecurrenceCleanup(); err == nil {
		t.Error("a cleanup mode alongside a real rule was accepted")
	}
}

// The ordinary case: an edit that does not touch recurrence at all.
func TestValidateRecurrenceCleanupIgnoresUnrelatedEdits(t *testing.T) {
	title := "Choir practice"
	req := UpdateCalendarEventRequest{Title: &title}
	if err := req.ValidateRecurrenceCleanup(); err != nil {
		t.Errorf("an edit that does not touch recurrence was rejected: %v", err)
	}
}
