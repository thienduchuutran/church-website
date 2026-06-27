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
