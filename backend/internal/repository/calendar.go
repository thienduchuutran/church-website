package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

type CalendarRepository struct {
	pool *pgxpool.Pool
}

func NewCalendarRepository(pool *pgxpool.Pool) *CalendarRepository {
	return &CalendarRepository{pool: pool}
}

// calendarRawRead reports whether a read wants each row's own stored text with
// no translation applied, signalled by an empty locale.
//
// This used to be `locale != "" && locale != "en"` - "en" counted as raw because
// the source column WAS English by definition. Migration 000013 broke that
// equivalence: a Vietnamese-authored row needs a translation to serve an English
// viewer, so "en" is now an ordinary target locale and only "" means raw.
//
// The raw path still has real callers - CalendarService.seedMonthNote appends to
// a note's own text, and the PATCH diff in UpdateEvent compares against what is
// actually stored. Both would be wrong if handed a translation.
func calendarRawRead(locale string) bool {
	return strings.TrimSpace(locale) == ""
}

// GetEventsByMonth returns all calendar events for the given year and month.
//
// Each row is served in `locale` when a translation exists, and in its own
// source_locale otherwise. The direction is per row, not per request: one month
// can legitimately hold an English-authored event and a Vietnamese-authored one,
// and a single viewer needs both rendered in their own language.
//
// An empty locale returns raw stored text - see calendarRawRead.
func (r *CalendarRepository) GetEventsByMonth(ctx context.Context, year, month int, locale string) ([]model.CalendarEvent, error) {
	if calendarRawRead(locale) {
		rows, err := r.pool.Query(ctx,
			// Overlap, not equality: a multi-day span belongs to this month if
			// its [date, end_date] range intersects the month - so a camp that
			// starts in April and ends in May shows up in BOTH months. A
			// single-day event (end_date NULL) collapses to date via COALESCE.
			`SELECT id, date::text, end_date::text, title, event_type, icon, private_address, address_public, color, notes, admin_id, created_at, updated_at, source_locale
			 FROM calendar_events
			 WHERE date < (make_date($1, $2, 1) + interval '1 month')
			   AND COALESCE(end_date, date) >= make_date($1, $2, 1)
			 ORDER BY date ASC, created_at ASC`,
			year, month,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var events []model.CalendarEvent
		for rows.Next() {
			var e model.CalendarEvent
			if err := rows.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.Color,
				&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt, &e.SourceLocale); err != nil {
				return nil, err
			}
			events = append(events, e)
		}
		if events == nil {
			events = []model.CalendarEvent{}
		}
		return events, rows.Err()
	}

	rows, err := r.pool.Query(ctx,
		// The CASE is the direction check, and it has to be per row: this month
		// may hold an English-authored event and a Vietnamese-authored one, and
		// the same viewer needs each served correctly. A row whose source_locale
		// already equals the viewer's locale is served straight from its own
		// column and never consults translations - which is what keeps an
		// all-English calendar viewed in English at zero join cost, exactly as
		// the pre-000013 fast path did.
		//
		// The inner COALESCE is the missing-translation fallback: showing the
		// source language beats showing nothing while the worker catches up.
		`SELECT e.id, e.date::text, e.end_date::text,
		        CASE WHEN e.source_locale = $3 THEN e.title
		             ELSE COALESCE(t_title.translated_text, e.title) END AS title,
		        e.event_type, e.icon, e.private_address, e.address_public, e.color,
		        CASE WHEN e.source_locale = $3 THEN e.notes
		             ELSE COALESCE(t_notes.translated_text, e.notes) END AS notes,
		        e.admin_id, e.created_at, e.updated_at,
		        -- machine_translated must also respect the direction, or a
		        -- Vietnamese-authored event would show the "AI translated" badge
		        -- to a Vietnamese reader who is looking at the human original.
		        e.source_locale <> $3 AND (
		          COALESCE((t_title.id IS NOT NULL AND t_title.is_ai_generated AND t_title.approved_by IS NULL), false)
		          OR
		          COALESCE((t_notes.id IS NOT NULL AND t_notes.is_ai_generated AND t_notes.approved_by IS NULL), false)
		        ) AS machine_translated,
		        -- The authored text, carried alongside the possibly-translated
		        -- title/notes above so the admin edit form always edits the
		        -- source. Free here: the row is already joined, these are just
		        -- two more columns off it. Stripped for non-admins in the handler.
		        e.title AS title_source,
		        e.notes AS notes_source,
		        e.source_locale
		 FROM calendar_events e
		 LEFT JOIN translations t_title
		   ON t_title.record_id = e.id AND t_title.field_name = 'title' AND t_title.locale = $3
		 LEFT JOIN translations t_notes
		   ON t_notes.record_id = e.id AND t_notes.field_name = 'notes' AND t_notes.locale = $3
		 WHERE e.date < (make_date($1, $2, 1) + interval '1 month')
		   AND COALESCE(e.end_date, e.date) >= make_date($1, $2, 1)
		 ORDER BY e.date ASC, e.created_at ASC`,
		year, month, locale,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []model.CalendarEvent
	for rows.Next() {
		var (
			e       model.CalendarEvent
			machine bool
		)
		if err := rows.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.Color,
			&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt, &machine, &e.TitleSource, &e.NotesSource, &e.SourceLocale); err != nil {
			return nil, err
		}
		e.MachineTranslated = machine
		events = append(events, e)
	}
	if events == nil {
		events = []model.CalendarEvent{}
	}
	return events, rows.Err()
}

// GetEventByID returns a single calendar event by its UUID. Used by the service
// to diff old vs new field values before enqueuing translation jobs - sending
// a no-op PATCH should not produce worker activity.
//
// Always returns the row's own stored text and its source_locale (no locale
// param, no translation join). The diff has to be against what is actually
// stored, in the language it is stored in - diffing against a translation would
// report a change on every edit and re-enqueue work forever.
func (r *CalendarRepository) GetEventByID(ctx context.Context, id string) (*model.CalendarEvent, error) {
	var e model.CalendarEvent
	err := r.pool.QueryRow(ctx,
		`SELECT id, date::text, end_date::text, title, event_type, icon, private_address, address_public, color, notes, admin_id, created_at, updated_at, source_locale
		 FROM calendar_events WHERE id = $1`,
		id,
	).Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.Color,
		&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt, &e.SourceLocale)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// GetMonthNote returns the sidebar note for a given year+month, or nil if none
// exists. Served in `locale` when a translation exists, in the note's own
// source_locale otherwise. An empty locale returns raw stored text - see
// calendarRawRead; seedMonthNote relies on that to append to the note's own text.
func (r *CalendarRepository) GetMonthNote(ctx context.Context, year, month int, locale string) (*model.CalendarMonthNote, error) {
	if calendarRawRead(locale) {
		var n model.CalendarMonthNote
		err := r.pool.QueryRow(ctx,
			`SELECT id, year, month, content, admin_id, created_at, updated_at, source_locale
			 FROM calendar_month_notes WHERE year = $1 AND month = $2`,
			year, month,
		).Scan(&n.ID, &n.Year, &n.Month, &n.Content, &n.AdminID, &n.CreatedAt, &n.UpdatedAt, &n.SourceLocale)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		return &n, nil
	}

	var (
		n       model.CalendarMonthNote
		machine bool
	)
	err := r.pool.QueryRow(ctx,
		// Same per-row direction check as GetEventsByMonth - a note authored in
		// Vietnamese is served as-is to a Vietnamese reader and translated only
		// for an English one.
		`SELECT mn.id, mn.year, mn.month,
		        CASE WHEN mn.source_locale = $3 THEN mn.content
		             ELSE COALESCE(t.translated_text, mn.content) END AS content,
		        mn.admin_id, mn.created_at, mn.updated_at,
		        mn.source_locale <> $3 AND
		        COALESCE((t.id IS NOT NULL AND t.is_ai_generated AND t.approved_by IS NULL), false) AS machine_translated,
		        -- Authored source for the admin Notes modal; see the same pattern
		        -- in GetEventsByMonth. Stripped for non-admins.
		        mn.content AS content_source,
		        mn.source_locale
		 FROM calendar_month_notes mn
		 LEFT JOIN translations t
		   ON t.record_id = mn.id AND t.field_name = 'content' AND t.locale = $3
		 WHERE mn.year = $1 AND mn.month = $2`,
		year, month, locale,
	).Scan(&n.ID, &n.Year, &n.Month, &n.Content, &n.AdminID, &n.CreatedAt, &n.UpdatedAt, &machine, &n.ContentSource, &n.SourceLocale)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	n.MachineTranslated = machine
	return &n, nil
}

// DeleteTranslationsForLocale removes a record's translations for one locale.
//
// Needed because source_locale can flip. An event authored in English has a
// locale='vi' translation row; rewrite it in Vietnamese and it now needs a
// locale='en' row instead, while that old locale='vi' row describes a language
// the record is now written in natively. Left alone it would sit in the review
// queue forever as pending Vietnamese work for a Vietnamese record - the reviewer
// would see the same text on both sides of the diff.
//
// Deletes regardless of approval status, unlike DeleteUnapproved: a human-approved
// Vietnamese translation of text that is now itself Vietnamese is not a reviewer
// edit worth protecting, it is a leftover.
func (r *CalendarRepository) DeleteTranslationsForLocale(ctx context.Context, recordID, locale string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM translations WHERE record_id = $1 AND locale = $2`,
		recordID, locale,
	)
	if err != nil {
		return fmt.Errorf("delete translations for %s/%s: %w", recordID, locale, err)
	}
	return nil
}

// InsertEvent creates a new calendar event and populates generated fields.
func (r *CalendarRepository) InsertEvent(ctx context.Context, e *model.CalendarEvent) error {
	return r.pool.QueryRow(ctx,
		// source_locale is resolved by the service (explicit admin choice, else
		// detection) before this runs, so it is written directly rather than
		// defaulted - relying on the column default here would silently file every
		// Vietnamese-authored event as English.
		`INSERT INTO calendar_events (date, end_date, title, event_type, icon, private_address, address_public, color, notes, admin_id, source_locale)
		 VALUES ($1::date, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING id, created_at, updated_at`,
		e.Date, e.EndDate, e.Title, e.EventType, e.Icon, e.PrivateAddress, e.AddressPublic, e.Color, e.Notes, e.AdminID, e.SourceLocale,
	).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

// UpdateEvent applies partial updates to a calendar event. Only non-nil fields
// are changed.
//
// sourceLocale is an explicit parameter rather than read off req because the
// service resolves it (explicit admin choice, else re-detection, else the value
// already stored) and the repository should not re-litigate that decision. It is
// always a concrete value, so it is written unconditionally.
func (r *CalendarRepository) UpdateEvent(ctx context.Context, id string, req *model.UpdateCalendarEventRequest, sourceLocale string) (*model.CalendarEvent, error) {
	row := r.pool.QueryRow(ctx,
		// end_date is written directly (not COALESCE-guarded like the other
		// fields) so an edit can both set a span AND clear one back to a single
		// day. The EventModal always submits the full event (end_date present as
		// a date or null), so a partial PATCH never accidentally wipes it.
		`UPDATE calendar_events SET
		   date            = COALESCE($2::date,                  date),
		   end_date        = $3::date,
		   title           = COALESCE($4,                        title),
		   -- text, not calendar_event_type: migration 000012 converted this
		   -- column off the enum so admins can create types at runtime.
		   event_type      = COALESCE($5::text,                  event_type),
		   icon            = COALESCE($6,                        icon),
		   private_address = CASE WHEN $7::boolean THEN $8 ELSE private_address END,
		   color           = COALESCE($9,                        color),
		   notes           = CASE WHEN $10::boolean THEN $11 ELSE notes END,
		   address_public  = $12,
		   source_locale   = $13,
		   updated_at      = now()
		 WHERE id = $1
		 RETURNING id, date::text, end_date::text, title, event_type, icon, private_address, address_public, color, notes, admin_id, created_at, updated_at, source_locale`,
		id, req.Date, req.EndDate, req.Title, req.EventType, req.Icon,
		req.PrivateAddress != nil, req.PrivateAddress,
		req.Color, req.Notes != nil, req.Notes,
		req.AddressPublic, sourceLocale,
	)
	var e model.CalendarEvent
	err := row.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.Color,
		&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt, &e.SourceLocale)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// DeleteEvent removes a calendar event by id. Returns ErrNotFound if no row was deleted.
func (r *CalendarRepository) DeleteEvent(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM calendar_events WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return model.ErrNotFound
	}
	return nil
}

// --- Event types (the admin-managed category vocabulary) ---

// ListEventTypes returns every event type, built-ins first in their curated
// order and admin-created ones after. Ordering lives in SQL rather than in the
// frontend so the chip row reads the same for every admin.
func (r *CalendarRepository) ListEventTypes(ctx context.Context) ([]model.CalendarEventTypeDef, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT slug, label, default_icon, default_color, is_builtin, sort_order, admin_id, created_at, updated_at
		 FROM calendar_event_types
		 ORDER BY sort_order, label`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	types := []model.CalendarEventTypeDef{}
	for rows.Next() {
		var t model.CalendarEventTypeDef
		if err := rows.Scan(&t.Slug, &t.Label, &t.DefaultIcon, &t.DefaultColor, &t.IsBuiltin,
			&t.SortOrder, &t.AdminID, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		types = append(types, t)
	}
	return types, rows.Err()
}

// GetEventType returns one type by slug, or ErrNotFound.
func (r *CalendarRepository) GetEventType(ctx context.Context, slug string) (*model.CalendarEventTypeDef, error) {
	var t model.CalendarEventTypeDef
	err := r.pool.QueryRow(ctx,
		`SELECT slug, label, default_icon, default_color, is_builtin, sort_order, admin_id, created_at, updated_at
		 FROM calendar_event_types WHERE slug = $1`, slug,
	).Scan(&t.Slug, &t.Label, &t.DefaultIcon, &t.DefaultColor, &t.IsBuiltin,
		&t.SortOrder, &t.AdminID, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// EventTypeExists answers the question the model validator can no longer
// answer on its own, now that the vocabulary lives in the database.
func (r *CalendarRepository) EventTypeExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM calendar_event_types WHERE slug = $1)`, slug,
	).Scan(&exists)
	return exists, err
}

// CreateEventType inserts a new admin-created type. On slug conflict it returns
// the row that already exists rather than erroring - two admins typing the same
// label the same week should converge on one type, not see a failure. Admin
// creations sort after the built-ins.
func (r *CalendarRepository) CreateEventType(ctx context.Context, t model.CalendarEventTypeDef) (*model.CalendarEventTypeDef, error) {
	var out model.CalendarEventTypeDef
	err := r.pool.QueryRow(ctx,
		`INSERT INTO calendar_event_types (slug, label, default_icon, default_color, is_builtin, sort_order, admin_id)
		 VALUES ($1, $2, $3, $4, false, 100, $5)
		 ON CONFLICT (slug) DO UPDATE SET slug = calendar_event_types.slug
		 RETURNING slug, label, default_icon, default_color, is_builtin, sort_order, admin_id, created_at, updated_at`,
		t.Slug, t.Label, t.DefaultIcon, t.DefaultColor, t.AdminID,
	).Scan(&out.Slug, &out.Label, &out.DefaultIcon, &out.DefaultColor, &out.IsBuiltin,
		&out.SortOrder, &out.AdminID, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// --- Palette colors (the shared custom swatch grid) ---

// ListPaletteColors returns the saved custom swatches in picker order.
func (r *CalendarRepository) ListPaletteColors(ctx context.Context) ([]model.PaletteColor, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, hex, sort_order, admin_id, created_at
		 FROM calendar_palette_colors
		 ORDER BY sort_order, created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	colors := []model.PaletteColor{}
	for rows.Next() {
		var c model.PaletteColor
		if err := rows.Scan(&c.ID, &c.Hex, &c.SortOrder, &c.AdminID, &c.CreatedAt); err != nil {
			return nil, err
		}
		colors = append(colors, c)
	}
	return colors, rows.Err()
}

// CreatePaletteColor saves a swatch to the shared palette. Adding a color that
// is already saved returns the existing row, so the "add to palette" button is
// idempotent and never surfaces a duplicate-key error to an admin.
func (r *CalendarRepository) CreatePaletteColor(ctx context.Context, hex string, adminID *string) (*model.PaletteColor, error) {
	var c model.PaletteColor
	err := r.pool.QueryRow(ctx,
		`INSERT INTO calendar_palette_colors (hex, admin_id)
		 VALUES ($1, $2)
		 ON CONFLICT (hex) DO UPDATE SET hex = calendar_palette_colors.hex
		 RETURNING id, hex, sort_order, admin_id, created_at`,
		hex, adminID,
	).Scan(&c.ID, &c.Hex, &c.SortOrder, &c.AdminID, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// DeletePaletteColor removes a saved swatch. Events already using that hex keep
// it - the color is copied onto the event, not referenced - so removing a
// swatch only shrinks the picker and never repaints the calendar.
func (r *CalendarRepository) DeletePaletteColor(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM calendar_palette_colors WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return model.ErrNotFound
	}
	return nil
}

// GetMonthSettings returns the saved per-month styling row for the given
// year+month, or nil (with no error) when the admin has not customized the
// month yet - callers fall back to the static MONTH_THEMES on the frontend.
func (r *CalendarRepository) GetMonthSettings(ctx context.Context, year, month int) (*model.CalendarMonthSettings, error) {
	var s model.CalendarMonthSettings
	err := r.pool.QueryRow(ctx,
		`SELECT id, year, month, accent_color, admin_id, created_at, updated_at
		 FROM calendar_month_settings WHERE year = $1 AND month = $2`,
		year, month,
	).Scan(&s.ID, &s.Year, &s.Month, &s.AccentColor, &s.AdminID, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// UpsertMonthSettings inserts or replaces the styling row for a given year+month.
func (r *CalendarRepository) UpsertMonthSettings(ctx context.Context, year, month int, accentColor string, adminID *string) (*model.CalendarMonthSettings, error) {
	var s model.CalendarMonthSettings
	err := r.pool.QueryRow(ctx,
		`INSERT INTO calendar_month_settings (year, month, accent_color, admin_id)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (year, month) DO UPDATE
		   SET accent_color = EXCLUDED.accent_color,
		       admin_id     = EXCLUDED.admin_id,
		       updated_at   = now()
		 RETURNING id, year, month, accent_color, admin_id, created_at, updated_at`,
		year, month, accentColor, adminID,
	).Scan(&s.ID, &s.Year, &s.Month, &s.AccentColor, &s.AdminID, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// UpsertMonthNote inserts or updates the sidebar note for a given year+month.
func (r *CalendarRepository) UpsertMonthNote(ctx context.Context, year, month int, content string, adminID *string, sourceLocale string) (*model.CalendarMonthNote, error) {
	var n model.CalendarMonthNote
	err := r.pool.QueryRow(ctx,
		`INSERT INTO calendar_month_notes (year, month, content, admin_id, source_locale)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (year, month) DO UPDATE
		   SET content = EXCLUDED.content,
		       admin_id = EXCLUDED.admin_id,
		       source_locale = EXCLUDED.source_locale,
		       updated_at = now()
		 RETURNING id, year, month, content, admin_id, created_at, updated_at, source_locale`,
		year, month, content, adminID, sourceLocale,
	).Scan(&n.ID, &n.Year, &n.Month, &n.Content, &n.AdminID, &n.CreatedAt, &n.UpdatedAt, &n.SourceLocale)
	if err != nil {
		return nil, err
	}
	return &n, nil
}
