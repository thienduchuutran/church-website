package service

import (
	"context"
	"fmt"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

type CalendarService struct {
	repo *repository.CalendarRepository
}

func NewCalendarService(repo *repository.CalendarRepository) *CalendarService {
	return &CalendarService{repo: repo}
}

// GetMonth returns the month's events, optional sidebar note, and optional
// per-month styling for a given year+month. Each piece is independent, so a
// missing note or settings row is not an error.
func (s *CalendarService) GetMonth(ctx context.Context, year, month int) (*model.CalendarMonthResponse, error) {
	events, err := s.repo.GetEventsByMonth(ctx, year, month)
	if err != nil {
		return nil, fmt.Errorf("get events: %w", err)
	}
	note, err := s.repo.GetMonthNote(ctx, year, month)
	if err != nil {
		return nil, fmt.Errorf("get month note: %w", err)
	}
	settings, err := s.repo.GetMonthSettings(ctx, year, month)
	if err != nil {
		return nil, fmt.Errorf("get month settings: %w", err)
	}
	return &model.CalendarMonthResponse{Events: events, MonthNote: note, MonthSettings: settings}, nil
}

// CreateEvent validates and persists a new calendar event.
func (s *CalendarService) CreateEvent(ctx context.Context, req model.CreateCalendarEventRequest, adminID string) (*model.CalendarEvent, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}
	e := &model.CalendarEvent{
		Date:      req.Date,
		Title:     req.Title,
		EventType: req.EventType,
		Icon:      req.Icon,
		Color:     req.Color,
		Notes:     req.Notes,
		AdminID:   &adminID,
	}
	if err := s.repo.InsertEvent(ctx, e); err != nil {
		return nil, fmt.Errorf("insert event: %w", err)
	}
	return e, nil
}

// UpdateEvent validates and applies partial updates to an existing event.
func (s *CalendarService) UpdateEvent(ctx context.Context, id string, req model.UpdateCalendarEventRequest) (*model.CalendarEvent, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}
	e, err := s.repo.UpdateEvent(ctx, id, &req)
	if err != nil {
		return nil, fmt.Errorf("update event: %w", err)
	}
	return e, nil
}

// DeleteEvent removes a calendar event by id.
func (s *CalendarService) DeleteEvent(ctx context.Context, id string) error {
	if err := s.repo.DeleteEvent(ctx, id); err != nil {
		return fmt.Errorf("delete event: %w", err)
	}
	return nil
}

// UpsertMonthNote sets the sidebar note for a given year+month.
func (s *CalendarService) UpsertMonthNote(ctx context.Context, year, month int, req model.UpsertMonthNoteRequest, adminID string) (*model.CalendarMonthNote, error) {
	n, err := s.repo.UpsertMonthNote(ctx, year, month, req.Content, &adminID)
	if err != nil {
		return nil, fmt.Errorf("upsert month note: %w", err)
	}
	return n, nil
}

// UpsertMonthSettings validates the incoming color and persists the per-month
// styling row. The hex format check lives in the request type so the same
// validation runs whether this is invoked from the HTTP handler or a future
// internal caller (CLI seed, batch import, etc.).
func (s *CalendarService) UpsertMonthSettings(ctx context.Context, year, month int, req model.UpsertMonthSettingsRequest, adminID string) (*model.CalendarMonthSettings, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}
	settings, err := s.repo.UpsertMonthSettings(ctx, year, month, req.AccentColor, &adminID)
	if err != nil {
		return nil, fmt.Errorf("upsert month settings: %w", err)
	}
	return settings, nil
}
