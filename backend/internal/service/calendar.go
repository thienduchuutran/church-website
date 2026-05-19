package service

import (
	"context"
	"fmt"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/translation"
)

type CalendarService struct {
	repo    *repository.CalendarRepository
	enqueue translation.EnqueueFn // optional - nil-safe; no jobs fire when nil
}

func NewCalendarService(repo *repository.CalendarRepository) *CalendarService {
	return &CalendarService{repo: repo}
}

// SetTranslationQueue wires the async translation enqueuer. Same opt-in
// pattern as the other services so a fresh dev environment without AI keys
// still creates events normally; translation just doesn't fan out.
func (s *CalendarService) SetTranslationQueue(enqueue translation.EnqueueFn) {
	s.enqueue = enqueue
}

// GetMonth returns the month's events, optional sidebar note, and optional
// per-month styling for a given year+month. Each piece is independent, so a
// missing note or settings row is not an error. When locale is non-English,
// titles/notes/content come from translations with English fallback.
func (s *CalendarService) GetMonth(ctx context.Context, year, month int, locale string) (*model.CalendarMonthResponse, error) {
	events, err := s.repo.GetEventsByMonth(ctx, year, month, locale)
	if err != nil {
		return nil, fmt.Errorf("get events: %w", err)
	}
	note, err := s.repo.GetMonthNote(ctx, year, month, locale)
	if err != nil {
		return nil, fmt.Errorf("get month note: %w", err)
	}
	settings, err := s.repo.GetMonthSettings(ctx, year, month)
	if err != nil {
		return nil, fmt.Errorf("get month settings: %w", err)
	}
	return &model.CalendarMonthResponse{Events: events, MonthNote: note, MonthSettings: settings}, nil
}

// CreateEvent validates and persists a new calendar event, then fires a
// translation job for its title and (when set) notes.
func (s *CalendarService) CreateEvent(ctx context.Context, req model.CreateCalendarEventRequest, adminID string) (*model.CalendarEvent, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}
	e := &model.CalendarEvent{
		Date:           req.Date,
		Title:          req.Title,
		EventType:      req.EventType,
		Icon:           req.Icon,
		PrivateAddress: req.PrivateAddress,
		Color:          req.Color,
		Notes:          req.Notes,
		AdminID:        &adminID,
	}
	if err := s.repo.InsertEvent(ctx, e); err != nil {
		return nil, fmt.Errorf("insert event: %w", err)
	}

	s.enqueueEventFields(e.ID, map[string]*string{
		"title": &e.Title,
		"notes": e.Notes,
	})

	return e, nil
}

// UpdateEvent validates the request, fetches the existing event for diffing,
// applies the patch, then enqueues translation only for fields that
// actually changed. Calendar entries get edited and re-edited (typo fixes,
// date corrections) - the diff prevents a no-op PATCH from spawning worker
// activity.
func (s *CalendarService) UpdateEvent(ctx context.Context, id string, req model.UpdateCalendarEventRequest) (*model.CalendarEvent, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}

	existing, err := s.repo.GetEventByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("fetch existing event: %w", err)
	}

	e, err := s.repo.UpdateEvent(ctx, id, &req)
	if err != nil {
		return nil, fmt.Errorf("update event: %w", err)
	}

	changed := map[string]*string{}
	if req.Title != nil && *req.Title != existing.Title {
		title := e.Title
		changed["title"] = &title
	}
	if req.Notes != nil && !stringPtrEqual(req.Notes, existing.Notes) {
		changed["notes"] = e.Notes
	}
	if len(changed) > 0 {
		s.enqueueEventFields(e.ID, changed)
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

// UpsertMonthNote sets the sidebar note for a given year+month, then enqueues
// translation for the new content. No diff here - the upsert returns the row
// but not the prior state, and a single text field with an empty default is
// cheap to "translate again" (the cache layer absorbs identical content).
func (s *CalendarService) UpsertMonthNote(ctx context.Context, year, month int, req model.UpsertMonthNoteRequest, adminID string) (*model.CalendarMonthNote, error) {
	n, err := s.repo.UpsertMonthNote(ctx, year, month, req.Content, &adminID)
	if err != nil {
		return nil, fmt.Errorf("upsert month note: %w", err)
	}

	if req.Content != "" {
		s.enqueueOne("calendar_month_notes", n.ID, "content", req.Content)
	}

	return n, nil
}

// UpsertMonthSettings validates the incoming color and persists the per-month
// styling row. The hex format check lives in the request type so the same
// validation runs whether this is invoked from the HTTP handler or a future
// internal caller (CLI seed, batch import, etc.). No translation: this is
// just a color string.
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

// enqueueEventFields fires a single translation job carrying every changed
// field on one event. Nil values are skipped (e.g., a Notes field cleared to
// nil has nothing to translate). The cache lookup in the worker would catch
// duplicates anyway, but skipping nil saves a job row.
func (s *CalendarService) enqueueEventFields(eventID string, fields map[string]*string) {
	if s.enqueue == nil {
		return
	}
	payload := map[string]string{}
	for k, v := range fields {
		if v == nil || *v == "" {
			continue
		}
		payload[k] = *v
	}
	if len(payload) == 0 {
		return
	}
	s.enqueue(translation.TranslationJob{
		TableName:     "calendar_events",
		RecordID:      eventID,
		Fields:        payload,
		TargetLocales: []string{"vi"},
		ContentType:   translation.ContentTypeGeneral,
	})
}

func (s *CalendarService) enqueueOne(tableName, recordID, fieldName, value string) {
	if s.enqueue == nil || value == "" {
		return
	}
	s.enqueue(translation.TranslationJob{
		TableName:     tableName,
		RecordID:      recordID,
		Fields:        map[string]string{fieldName: value},
		TargetLocales: []string{"vi"},
		ContentType:   translation.ContentTypeGeneral,
	})
}
