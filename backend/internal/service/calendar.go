package service

import (
	"context"
	"fmt"
	"strings"
	"time"

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
	if err := s.requireEventType(ctx, string(req.EventType)); err != nil {
		return nil, err
	}
	e := &model.CalendarEvent{
		Date:           req.Date,
		EndDate:        req.EndDate,
		Title:          req.Title,
		EventType:      req.EventType,
		Icon:           req.Icon,
		PrivateAddress: req.PrivateAddress,
		AddressPublic:  req.AddressPublic,
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

	// Prefill the month's footer note with a line for this event ("prefill then
	// edit"). Best-effort: it never blocks or fails the create.
	s.seedMonthNote(ctx, e, adminID)

	return e, nil
}

// buildSeedLine renders a one-line summary of an event for the month note, e.g.
// "• May 22-25: Youth Camp" or "• May 22: Game Night". Uses a hyphen for date
// ranges (same-month "May 22-25", cross-month "May 30 - Jun 2").
func buildSeedLine(e *model.CalendarEvent) string {
	start, err := time.Parse("2006-01-02", e.Date)
	if err != nil {
		return "• " + e.Title
	}
	datePart := start.Format("Jan 2")
	if e.EndDate != nil && *e.EndDate != "" && *e.EndDate != e.Date {
		if end, err := time.Parse("2006-01-02", *e.EndDate); err == nil {
			if end.Month() == start.Month() && end.Year() == start.Year() {
				datePart = fmt.Sprintf("%s-%d", start.Format("Jan 2"), end.Day())
			} else {
				datePart = fmt.Sprintf("%s - %s", start.Format("Jan 2"), end.Format("Jan 2"))
			}
		}
	}
	return fmt.Sprintf("• %s: %s", datePart, e.Title)
}

// seedMonthNote appends a one-line summary of a newly created event to that
// month's note. It is KEEP-EDIT: it only ever appends a new line and never
// rewrites existing text, so an admin's curation is never clobbered. Best-effort
// - any failure here is swallowed so it can't fail event creation (the event is
// already persisted by the time this runs).
func (s *CalendarService) seedMonthNote(ctx context.Context, e *model.CalendarEvent, adminID string) {
	start, err := time.Parse("2006-01-02", e.Date)
	if err != nil {
		return
	}
	year, month := start.Year(), int(start.Month())

	line := buildSeedLine(e)

	existing, err := s.repo.GetMonthNote(ctx, year, month, "")
	if err != nil {
		return
	}
	current := ""
	if existing != nil {
		current = existing.Content
	}
	// Dedupe so a retry (or a duplicate event) doesn't append the same line twice.
	if strings.Contains(current, line) {
		return
	}

	newContent := line
	if strings.TrimSpace(current) != "" {
		newContent = current + "\n" + line
	}

	saved, err := s.repo.UpsertMonthNote(ctx, year, month, newContent, &adminID)
	if err != nil {
		return
	}
	s.enqueueOne("calendar_month_notes", saved.ID, "content", newContent)
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
	if req.EventType != nil {
		if err := s.requireEventType(ctx, string(*req.EventType)); err != nil {
			return nil, err
		}
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

// --- Event types ---

// requireEventType rejects an event whose type does not exist. The foreign key
// would catch this too, but a FK violation surfaces as an opaque 500 with a
// constraint name in it; catching it here turns a typo'd slug into a readable
// 400 for the admin who caused it.
func (s *CalendarService) requireEventType(ctx context.Context, slug string) error {
	exists, err := s.repo.EventTypeExists(ctx, slug)
	if err != nil {
		return fmt.Errorf("check event type: %w", err)
	}
	if !exists {
		return fmt.Errorf("unknown event_type: %s", slug)
	}
	return nil
}

// ListEventTypes returns the full category vocabulary for the picker.
func (s *CalendarService) ListEventTypes(ctx context.Context) ([]model.CalendarEventTypeDef, error) {
	types, err := s.repo.ListEventTypes(ctx)
	if err != nil {
		return nil, fmt.Errorf("list event types: %w", err)
	}
	return types, nil
}

// CreateEventType turns an admin-typed label into a reusable category.
//
// The slug is derived from the label rather than supplied, which is what makes
// the inline "create as you type" flow safe: two admins who both type "Baptism"
// converge on one type instead of creating near-duplicates that would fragment
// the calendar. When the slug already exists the repository returns the
// existing row, so this reads as "get or create" from the caller's side.
func (s *CalendarService) CreateEventType(ctx context.Context, req model.CreateEventTypeRequest, adminID string) (*model.CalendarEventTypeDef, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}
	label := strings.TrimSpace(req.Label)
	slug := model.SlugifyEventType(label)
	// Validate() already rejected labels that slug to nothing, so this is a
	// belt-and-braces guard against an empty primary key.
	if slug == "" {
		return nil, fmt.Errorf("label must contain at least one letter or number")
	}

	t, err := s.repo.CreateEventType(ctx, model.CalendarEventTypeDef{
		Slug:         slug,
		Label:        label,
		DefaultIcon:  req.DefaultIcon,
		DefaultColor: req.DefaultColor,
		AdminID:      &adminID,
	})
	if err != nil {
		return nil, fmt.Errorf("create event type: %w", err)
	}
	return t, nil
}

// --- Palette colors ---

// ListPaletteColors returns the shared custom swatches for the color picker.
func (s *CalendarService) ListPaletteColors(ctx context.Context) ([]model.PaletteColor, error) {
	colors, err := s.repo.ListPaletteColors(ctx)
	if err != nil {
		return nil, fmt.Errorf("list palette colors: %w", err)
	}
	return colors, nil
}

// CreatePaletteColor saves a swatch to the shared palette. Hex is normalized to
// uppercase so "#2e7d9a" and "#2E7D9A" are one swatch rather than two
// indistinguishable rows sitting next to each other in the grid.
func (s *CalendarService) CreatePaletteColor(ctx context.Context, req model.CreatePaletteColorRequest, adminID string) (*model.PaletteColor, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}
	c, err := s.repo.CreatePaletteColor(ctx, strings.ToUpper(req.Hex), &adminID)
	if err != nil {
		return nil, fmt.Errorf("create palette color: %w", err)
	}
	return c, nil
}

// DeletePaletteColor removes a saved swatch from the picker.
func (s *CalendarService) DeletePaletteColor(ctx context.Context, id string) error {
	if err := s.repo.DeletePaletteColor(ctx, id); err != nil {
		return fmt.Errorf("delete palette color: %w", err)
	}
	return nil
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
