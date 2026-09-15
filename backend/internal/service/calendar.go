package service

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/translation"
)

type CalendarService struct {
	repo    *repository.CalendarRepository
	enqueue translation.EnqueueFn // optional - nil-safe; no jobs fire when nil
	places  *placeResolver
}

func NewCalendarService(repo *repository.CalendarRepository) *CalendarService {
	return &CalendarService{repo: repo, places: &placeResolver{store: repo}}
}

// SetTranslationQueue wires the async translation enqueuer. Same opt-in
// pattern as the other services so a fresh dev environment without AI keys
// still creates events normally; translation just doesn't fan out.
func (s *CalendarService) SetTranslationQueue(enqueue translation.EnqueueFn) {
	s.enqueue = enqueue
}

// SetPlaceNamer wires the model call that names a newly-seen address. Same
// opt-in pattern: without it, addresses still resolve to places and still
// dedupe - the places just keep the provisional name (the event title) instead
// of being labelled "Church".
func (s *CalendarService) SetPlaceNamer(n PlaceNamer) {
	s.places.namer = n
}

// resolveEventPlace maps an event's address to a venue and, when that venue is
// new, spends one model call naming it.
//
// The naming call is deliberately detached: it runs on context.Background() in
// a goroutine, so an admin saving an event never waits on Gemini and a Gemini
// outage can never fail a save. Same fire-and-forget shape as the fine-tuning
// capture in service/translation.go. The trade-off is that a crash in the
// window between insert and answer leaves the provisional name - recoverable,
// because an admin can rename the place, and invisible to the congregation
// because the provisional name is the event's own title.
//
// A resolution failure is logged and swallowed rather than failing the save.
// Losing the venue grouping costs a duplicate row in the Locations strip, which
// is exactly what this feature replaced; losing the event would be worse.
func (s *CalendarService) resolveEventPlace(ctx context.Context, address *string, title string) *model.CalendarPlace {
	place, isNew, err := s.places.resolve(ctx, address, title)
	if err != nil {
		log.Printf("calendar: resolve place for %q: %v", title, err)
		return nil
	}
	if isNew && place != nil {
		id, addr := place.ID, strings.TrimSpace(*address)
		go func() {
			nctx, cancel := context.WithTimeout(context.Background(), placeNameTimeout)
			defer cancel()
			if err := s.places.name(nctx, id, addr, title); err != nil {
				log.Printf("calendar: name place %s: %v", id, err)
			}
		}()
	}
	return place
}

// attachPlace expands an event's place_id onto the response so a create or
// update returns the same shape a month read does. Best-effort: the event is
// already saved, and a missing place object costs the caller a refetch at worst.
func (s *CalendarService) attachPlace(ctx context.Context, e *model.CalendarEvent) {
	if e == nil || e.PlaceID == nil || e.Place != nil {
		return
	}
	place, err := s.repo.GetPlaceByID(ctx, *e.PlaceID)
	if err != nil {
		log.Printf("calendar: expand place %s on event %s: %v", *e.PlaceID, e.ID, err)
		return
	}
	e.Place = place
}

// resolveSourceLocale decides which language a record's text is in, from the text
// and nothing else.
//
// There is no admin override and no UI-locale input by design. Which language the
// admin panel is displaying says nothing about which language the admin is typing
// in, so letting it vote is what would file an English post composed in
// Vietnamese mode as Vietnamese.
//
// `current` covers only the one case with no text to read: an edit that changes
// no text fields at all (a date-only PATCH) keeps the language already stored
// rather than resetting it.
func resolveSourceLocale(fields map[string]string, current string) string {
	if len(fields) > 0 {
		return translation.DetectLocaleFields(fields)
	}
	if current != "" {
		return current
	}
	return "en"
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
	// Decide the language before inserting - the column is written directly, not
	// defaulted, so this is the only chance to get it right. "" for current
	// because a brand-new event has no prior language to preserve.
	sourceLocale := resolveSourceLocale(textFields(req.Title, req.Notes), "")

	// Resolve the venue before inserting, so the event lands with its place_id
	// already set and the Locations strip groups it on the very first render.
	place := s.resolveEventPlace(ctx, req.PrivateAddress, req.Title)
	var placeID *string
	if place != nil {
		placeID = &place.ID
	}

	e := &model.CalendarEvent{
		Date:           req.Date,
		EndDate:        req.EndDate,
		Title:          req.Title,
		EventType:      req.EventType,
		Icon:           req.Icon,
		PrivateAddress: req.PrivateAddress,
		AddressPublic:  req.AddressPublic,
		PlaceID:        placeID,
		Place:          place,
		Color:          req.Color,
		Notes:          req.Notes,
		AdminID:        &adminID,
		SourceLocale:   sourceLocale,
	}
	// A recurring create writes the whole series in one transaction; a one-off
	// takes the path it always took. Either way exactly ONE row is enqueued for
	// translation below, because the anchor's id is what the read path resolves
	// a sibling's text through - see the series fallback in GetEventsByMonth.
	// That is the difference between forty review entries and a hundred and
	// twenty, and it is the whole reason this design was viable.
	if req.Recurrence != nil && *req.Recurrence != "" {
		start, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			return nil, fmt.Errorf("parse start date: %w", err)
		}
		var until *time.Time
		if req.RecurrenceUntil != nil && *req.RecurrenceUntil != "" {
			u, err := time.Parse("2006-01-02", *req.RecurrenceUntil)
			if err != nil {
				return nil, fmt.Errorf("parse recurrence_until: %w", err)
			}
			until = &u
		}
		later, err := OccurrencesForCreate(start, *req.Recurrence, until)
		if err != nil {
			return nil, fmt.Errorf("generate occurrences: %w", err)
		}
		e.RecurrenceRule = req.Recurrence
		e.RecurrenceUntil = req.RecurrenceUntil
		if err := s.repo.InsertSeries(ctx, e, later); err != nil {
			return nil, fmt.Errorf("insert series: %w", err)
		}
	} else if err := s.repo.InsertEvent(ctx, e); err != nil {
		return nil, fmt.Errorf("insert event: %w", err)
	}

	s.enqueueEventFields(e.ID, sourceLocale, map[string]*string{
		"title": &e.Title,
		"notes": e.Notes,
	})

	// Creating an event deliberately does NOT touch the month note. It used to
	// append a "• May 22: Youth Camp" line ("prefill then edit"), which meant
	// every event was restated in the footer whether or not it belonged there -
	// the admin's curated note filled up with lines they had to delete. The note
	// is hand-written commentary about the month, not an index of it; the grid
	// already lists every event.

	return e, nil
}

// UpdateEvent validates the request, fetches the existing event for diffing,
// applies the patch, then enqueues translation only for fields that
// actually changed. Calendar entries get edited and re-edited (typo fixes,
// date corrections) - the diff prevents a no-op PATCH from spawning worker
// activity.
func (s *CalendarService) UpdateEvent(ctx context.Context, id string, req model.UpdateCalendarEventRequest, scope model.WriteScope) (*model.CalendarEvent, error) {
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

	// Resolve against the text as it will be AFTER the patch, not as it was: an
	// edit that rewrites an English title in Vietnamese has to re-detect. Falling
	// back to existing values keeps a date-only PATCH from detecting on nothing,
	// and `existing.SourceLocale` as `current` means such a PATCH preserves the
	// language rather than resetting it to a default.
	newTitle := existing.Title
	if req.Title != nil {
		newTitle = *req.Title
	}
	newNotes := existing.Notes
	if req.Notes != nil {
		newNotes = req.Notes
	}
	sourceLocale := resolveSourceLocale(textFields(newTitle, newNotes), existing.SourceLocale)

	// Only re-resolve when this PATCH actually submitted an address. The
	// repository guards place_id behind the same condition, so a date-only edit
	// keeps the venue it already had instead of being handed a nil that would
	// blank it. Titles matter here too: the resolved place is named from the
	// title, so the post-patch title is what a brand-new venue gets named after.
	var placeID *string
	if req.PrivateAddress != nil {
		if place := s.resolveEventPlace(ctx, req.PrivateAddress, newTitle); place != nil {
			placeID = &place.ID
		}
	}

	// A scope wider than this one occurrence only means anything for a row that
	// belongs to a series. Asking for "all events" on a one-off is not an error
	// worth rejecting - it describes a series of one - so it quietly takes the
	// single-row path.
	if scope != model.ScopeOccurrence && existing.SeriesID != nil {
		return s.updateSeries(ctx, existing, &req, sourceLocale, placeID, scope)
	}

	e, err := s.repo.UpdateEvent(ctx, id, &req, sourceLocale, placeID)
	if err != nil {
		return nil, fmt.Errorf("update event: %w", err)
	}
	// The PATCH may have kept a place it did not submit an address for, so the
	// response is expanded from whatever place_id actually survived the write.
	s.attachPlace(ctx, e)

	// The language flipped, so any translation into the NEW source language is
	// now describing text the record holds natively. Left in place it would show
	// up in the review queue as pending work whose two sides are the same
	// language. Best-effort: the event is already saved, and a leftover row is a
	// review-queue annoyance rather than a serving bug (the direction-aware read
	// path ignores it).
	if existing.SourceLocale != sourceLocale {
		if err := s.repo.DeleteTranslationsForLocale(ctx, id, sourceLocale); err != nil {
			log.Printf("calendar: purge stale %s translations for event %s: %v", sourceLocale, id, err)
		}
	}

	changed := map[string]*string{}
	if req.Title != nil && *req.Title != existing.Title {
		title := e.Title
		changed["title"] = &title
	}
	if req.Notes != nil && !stringPtrEqual(req.Notes, existing.Notes) {
		changed["notes"] = e.Notes
	}
	// A language flip re-translates even when the text is byte-identical: the same
	// words now need to go the other way, and the old direction's output is gone.
	if existing.SourceLocale != sourceLocale && len(changed) == 0 {
		title := e.Title
		changed["title"] = &title
		if e.Notes != nil && *e.Notes != "" {
			changed["notes"] = e.Notes
		}
	}
	if len(changed) > 0 {
		s.enqueueEventFields(e.ID, sourceLocale, changed)
	}

	return e, nil
}

// updateSeries applies a descriptive edit to a whole series, or to the clicked
// occurrence and every later one.
//
// Translation is where this differs from editing a single row, and it is worth
// stating plainly. The new text is enqueued ONCE, against the anchor, because
// the anchor is what every sibling resolves through. Any occurrence that had
// been edited on its own owns a translation that now describes text nobody can
// see any more, and the read path would keep preferring it - so those rows are
// cleared and fall back onto the anchor's fresh translation.
func (s *CalendarService) updateSeries(ctx context.Context, existing *model.CalendarEvent, req *model.UpdateCalendarEventRequest, sourceLocale string, placeID *string, scope model.WriteScope) (*model.CalendarEvent, error) {
	seriesID := *existing.SeriesID

	// "This and following" is a date comparison and nothing more - the rows are
	// already sitting in the table with real dates on them, which is the payoff
	// of storing occurrences instead of a rule.
	var from *string
	if scope == model.ScopeFollowing {
		from = &existing.Date
	}

	if _, err := s.repo.UpdateBySeries(ctx, seriesID, from, req, sourceLocale, placeID); err != nil {
		return nil, fmt.Errorf("update series: %w", err)
	}

	if req.Recurrence != nil {
		if err := req.ValidateRecurrenceCleanup(); err != nil {
			return nil, err
		}
		if scope != model.ScopeSeries {
			return nil, fmt.Errorf("changing how a series repeats applies to the whole series; use scope=series")
		}
		if err := s.applyRuleChange(ctx, seriesID, req); err != nil {
			return nil, err
		}
	}

	textChanged := (req.Title != nil && *req.Title != existing.Title) ||
		(req.Notes != nil && !stringPtrEqual(req.Notes, existing.Notes)) ||
		existing.SourceLocale != sourceLocale

	if textChanged {
		if err := s.repo.DeleteOccurrenceTranslations(ctx, seriesID, from); err != nil {
			// Best-effort, exactly like the language-flip purge below: the edit
			// is already saved, and a leftover row shows stale text on one
			// occurrence rather than breaking the page.
			log.Printf("calendar: clear diverged translations for series %s: %v", seriesID, err)
		}
		if existing.SourceLocale != sourceLocale {
			if err := s.repo.DeleteTranslationsForLocale(ctx, seriesID, sourceLocale); err != nil {
				log.Printf("calendar: purge stale %s translations for series %s: %v", sourceLocale, seriesID, err)
			}
		}
		changed := map[string]*string{}
		title := existing.Title
		if req.Title != nil {
			title = *req.Title
		}
		changed["title"] = &title
		notes := existing.Notes
		if req.Notes != nil {
			notes = req.Notes
		}
		if notes != nil && *notes != "" {
			changed["notes"] = notes
		}
		s.enqueueEventFields(seriesID, sourceLocale, changed)
	}

	// Return the occurrence the admin actually clicked, re-read so the response
	// reflects what was written rather than what was requested.
	updated, err := s.repo.GetEventByID(ctx, existing.ID)
	if err != nil {
		return nil, fmt.Errorf("re-read edited occurrence: %w", err)
	}
	s.attachPlace(ctx, updated)
	return updated, nil
}

// applyRuleChange rewrites how a series repeats, then rebuilds its future.
//
// The anchor is left in place and everything else is regenerated. That is the
// only version of this that stays coherent: the anchor is the series' start
// date, it owns the rule, it holds the translation every sibling resolves
// through, and its id is what the series is grouped by. Re-creating it would
// hand the series a new identity and orphan its translation for nothing.
//
// Occurrences that had been edited individually are destroyed here. That is not
// a bug introduced by this path - it is the trade-off already accepted for any
// series-wide edit, and the modal says so before the admin confirms.
//
// An empty rule means "stop repeating". It deliberately does NOT delete the
// dates already on the calendar: those are real events the congregation may
// have planned around, and quietly removing three years of them because
// somebody switched a dropdown would be the most destructive thing this feature
// could do. It stops generating; it does not retract.
func (s *CalendarService) applyRuleChange(ctx context.Context, seriesID string, req *model.UpdateCalendarEventRequest) error {
	anchor, err := s.repo.GetEventByID(ctx, seriesID)
	if err != nil {
		return fmt.Errorf("fetch series anchor: %w", err)
	}

	rule := strings.TrimSpace(*req.Recurrence)
	if rule == "" {
		if err := s.repo.SetSeriesRule(ctx, seriesID, nil, nil); err != nil {
			return err
		}
		// The admin said what should happen to the dates already generated;
		// the request validator guarantees they said something.
		if req.RecurrenceCleanup != nil && *req.RecurrenceCleanup == model.RecurrenceCleanupFuture {
			if _, err := s.repo.DeleteFutureOccurrences(ctx, seriesID); err != nil {
				return fmt.Errorf("remove future occurrences: %w", err)
			}
		}
		return nil
	}

	var until *time.Time
	var untilArg *string
	if req.RecurrenceUntil != nil && *req.RecurrenceUntil != "" {
		u, err := time.Parse("2006-01-02", *req.RecurrenceUntil)
		if err != nil {
			return fmt.Errorf("parse recurrence_until: %w", err)
		}
		until, untilArg = &u, req.RecurrenceUntil
	}

	start, err := time.Parse("2006-01-02", anchor.Date)
	if err != nil {
		return fmt.Errorf("parse series start: %w", err)
	}
	// Generate BEFORE deleting anything: an unparseable rule should leave the
	// calendar exactly as it was rather than emptying a series and then failing.
	dates, err := OccurrencesForCreate(start, rule, until)
	if err != nil {
		return fmt.Errorf("generate occurrences: %w", err)
	}

	if err := s.repo.SetSeriesRule(ctx, seriesID, &rule, untilArg); err != nil {
		return err
	}
	if _, err := s.repo.DeleteGeneratedOccurrences(ctx, seriesID); err != nil {
		return fmt.Errorf("clear old occurrences: %w", err)
	}
	if _, err := s.repo.AppendOccurrences(ctx, seriesID, dates); err != nil {
		return fmt.Errorf("write new occurrences: %w", err)
	}
	return nil
}

// extensionWarningMonths is how far ahead a series has to be running out
// before the admin panel mentions it. Twelve months means a yearly birthday is
// flagged a whole cycle before it would ever be missed, which is the only
// warning window that actually protects a yearly series.
const extensionWarningMonths = 12

// ListSeries returns every recurring series with a flag for the ones that need
// extending.
//
// The flag is computed here rather than in SQL because it is a judgement about
// two different situations that look identical in the data. A series with an
// "Ends on" date that has been fully generated is FINISHED - it stops because
// the admin said so, and nagging about it would train them to ignore the
// warning. A series that stops early, or has no end date at all, is RUNNING
// OUT. Only the second kind is flagged.
func (s *CalendarService) ListSeries(ctx context.Context) ([]model.CalendarSeries, error) {
	all, err := s.repo.ListSeries(ctx)
	if err != nil {
		return nil, fmt.Errorf("list series: %w", err)
	}
	cutoff := time.Now().AddDate(0, extensionWarningMonths, 0)
	for i := range all {
		last, err := time.Parse("2006-01-02", all[i].LastDate)
		if err != nil {
			continue // a series we cannot read a date for is not one to nag about
		}
		finished := false
		if all[i].Until != nil {
			if until, err := time.Parse("2006-01-02", *all[i].Until); err == nil {
				finished = !last.Before(until)
			}
		}
		// A COUNT-bounded series is finished once it has all its occurrences.
		// Without this it would be flagged forever: it has no end DATE, so it
		// looks open-ended, while extending it can never produce anything.
		if !finished {
			if r, err := ParseRRule(all[i].Rule); err == nil && r.Count > 0 && all[i].Count >= r.Count {
				finished = true
			}
		}
		all[i].NeedsExtension = !finished && last.Before(cutoff)
	}
	return all, nil
}

// ExtendSeries writes another horizon's worth of occurrences onto an existing
// series, starting after the last one already stored.
//
// Manual rather than automatic on purpose. Generating rows on backend startup
// would be a write-on-boot on a system where migrations already auto-apply, and
// a bad deploy that also mutates data is a much worse afternoon than one that
// only fails to start. The warning plus a button has the same effect with none
// of that risk.
func (s *CalendarService) ExtendSeries(ctx context.Context, seriesID string) (int, error) {
	anchor, err := s.repo.GetEventByID(ctx, seriesID)
	if err != nil {
		return 0, fmt.Errorf("fetch series anchor: %w", err)
	}
	if anchor.RecurrenceRule == nil {
		return 0, fmt.Errorf("event %s is not a recurring series", seriesID)
	}

	all, err := s.repo.ListSeries(ctx)
	if err != nil {
		return 0, fmt.Errorf("read series state: %w", err)
	}
	var lastDate string
	for _, c := range all {
		if c.ID == seriesID {
			lastDate = c.LastDate
			break
		}
	}
	if lastDate == "" {
		return 0, model.ErrNotFound
	}

	// The rule is still applied from the ORIGINAL start date, so a birthday
	// keeps landing on its real day; only the lower bound moves.
	start, err := time.Parse("2006-01-02", anchor.Date)
	if err != nil {
		return 0, fmt.Errorf("parse series start: %w", err)
	}
	after, err := time.Parse("2006-01-02", lastDate)
	if err != nil {
		return 0, fmt.Errorf("parse last occurrence: %w", err)
	}
	var until *time.Time
	if anchor.RecurrenceUntil != nil && *anchor.RecurrenceUntil != "" {
		if u, err := time.Parse("2006-01-02", *anchor.RecurrenceUntil); err == nil {
			until = &u
		}
	}

	dates, err := OccurrencesForExtend(start, *anchor.RecurrenceRule, until, after)
	if err != nil {
		return 0, fmt.Errorf("generate occurrences: %w", err)
	}
	n, err := s.repo.AppendOccurrences(ctx, seriesID, dates)
	if err != nil {
		return 0, fmt.Errorf("append occurrences: %w", err)
	}
	return int(n), nil
}

// DeleteEvent removes a calendar event, or part of its series, depending on
// scope. The scope is always supplied explicitly by the caller - the handler
// rejects a request that omits it rather than guessing, because guessing is how
// an admin deletes forty birthdays intending to delete one.
func (s *CalendarService) DeleteEvent(ctx context.Context, id string, scope model.WriteScope) error {
	if scope != model.ScopeOccurrence {
		existing, err := s.repo.GetEventByID(ctx, id)
		if err != nil {
			return fmt.Errorf("fetch event for scoped delete: %w", err)
		}
		if existing.SeriesID != nil {
			var from *string
			if scope == model.ScopeFollowing {
				from = &existing.Date
			}
			n, err := s.repo.DeleteBySeries(ctx, *existing.SeriesID, from)
			if err != nil {
				return fmt.Errorf("delete series: %w", err)
			}
			if n == 0 {
				return model.ErrNotFound
			}
			return nil
		}
	}
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
	// The prior note is read raw ("" locale) purely for its source_locale, so a
	// save that only reformats existing text keeps the language it already had.
	// A missing note is not an error here - it just means there is no prior
	// language to preserve.
	prior, err := s.repo.GetMonthNote(ctx, year, month, "")
	if err != nil {
		return nil, fmt.Errorf("fetch existing month note: %w", err)
	}
	current := ""
	if prior != nil {
		current = prior.SourceLocale
	}

	sourceLocale := resolveSourceLocale(textFields(req.Content, nil), current)

	n, err := s.repo.UpsertMonthNote(ctx, year, month, req.Content, &adminID, sourceLocale)
	if err != nil {
		return nil, fmt.Errorf("upsert month note: %w", err)
	}

	// Same flip cleanup as UpdateEvent - a translation into the note's new source
	// language is now redundant with the note itself.
	if current != "" && current != sourceLocale {
		if err := s.repo.DeleteTranslationsForLocale(ctx, n.ID, sourceLocale); err != nil {
			log.Printf("calendar: purge stale %s translations for month note %s: %v", sourceLocale, n.ID, err)
		}
	}

	if req.Content != "" {
		s.enqueueOne("calendar_month_notes", n.ID, "content", req.Content, sourceLocale)
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

// ListPlaces returns every venue with its usage count. Backs the event form's
// address suggestions, which is the half of this feature that prevents
// duplicates rather than merely hiding them: normalization folds two spellings
// of one address, but it cannot fold a genuine typo ("10 Main St" for "101 Main
// St"), and only picking a known place avoids that.
func (s *CalendarService) ListPlaces(ctx context.Context) ([]model.CalendarPlace, error) {
	places, err := s.repo.ListPlaces(ctx)
	if err != nil {
		return nil, fmt.Errorf("list places: %w", err)
	}
	return places, nil
}

// RenamePlace applies an admin's correction to a venue label.
//
// This is the escape hatch that makes shipping a model-proposed name onto a
// public page defensible at all. The model is occasionally wrong, the answer
// renders on the calendar and inside the exported PNG, and without this an
// admin has no recourse: re-typing the address resolves to the same place by
// design, so there is no way to "edit around" a bad label.
//
// One rename fixes every event at the address, because the name lives on the
// place rather than on each event.
func (s *CalendarService) RenamePlace(ctx context.Context, id string, req model.UpdateCalendarPlaceRequest) (*model.CalendarPlace, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}
	p, err := s.repo.RenamePlace(ctx, id, strings.TrimSpace(req.Name))
	if err != nil {
		return nil, err
	}
	return p, nil
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
// sourceLocale is passed rather than assumed. TargetLocales used to be a
// hardcoded {"vi"}, which was only ever correct because English was the sole
// possible source; a Vietnamese-authored event needs an English translation
// instead, and leaving the literal in place would have left it untranslated
// while also asking the worker to translate Vietnamese into Vietnamese.
//
// TargetLocales is left empty on purpose: EnqueueTranslation derives it from
// SourceLocale, so the "translate into everything except the source" rule lives
// in exactly one place instead of at every call site.
func (s *CalendarService) enqueueEventFields(eventID, sourceLocale string, fields map[string]*string) {
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
		TableName:    "calendar_events",
		RecordID:     eventID,
		Fields:       payload,
		SourceLocale: sourceLocale,
		ContentType:  translation.ContentTypeGeneral,
	})
}

func (s *CalendarService) enqueueOne(tableName, recordID, fieldName, value, sourceLocale string) {
	if s.enqueue == nil || value == "" {
		return
	}
	s.enqueue(translation.TranslationJob{
		TableName:    tableName,
		RecordID:     recordID,
		Fields:       map[string]string{fieldName: value},
		SourceLocale: sourceLocale,
		ContentType:  translation.ContentTypeGeneral,
	})
}

// textFields collects the translatable text of a record into the shape
// DetectLocaleFields wants, dropping nil and empty values so a cleared Notes
// field cannot dilute the evidence from a populated title.
func textFields(title string, notes *string) map[string]string {
	out := map[string]string{}
	if strings.TrimSpace(title) != "" {
		out["title"] = title
	}
	if notes != nil && strings.TrimSpace(*notes) != "" {
		out["notes"] = *notes
	}
	return out
}
