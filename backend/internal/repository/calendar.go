package repository

import (
	"context"
	"errors"
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

// calendarLocaleIsLocalized mirrors isLocalized in posts.go - "" and "en" mean
// English source, anything else means apply the translation joins.
func calendarLocaleIsLocalized(locale string) bool {
	locale = strings.TrimSpace(locale)
	return locale != "" && locale != "en"
}

// GetEventsByMonth returns all calendar events for the given year and month.
// When locale is non-English, title and notes are served via COALESCE from
// the translations table; missing translations fall back to English.
func (r *CalendarRepository) GetEventsByMonth(ctx context.Context, year, month int, locale string) ([]model.CalendarEvent, error) {
	if !calendarLocaleIsLocalized(locale) {
		rows, err := r.pool.Query(ctx,
			// Overlap, not equality: a multi-day span belongs to this month if
			// its [date, end_date] range intersects the month - so a camp that
			// starts in April and ends in May shows up in BOTH months. A
			// single-day event (end_date NULL) collapses to date via COALESCE.
			`SELECT id, date::text, end_date::text, title, event_type, icon, private_address, color, notes, admin_id, created_at, updated_at
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
			if err := rows.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.Color,
				&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt); err != nil {
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
		`SELECT e.id, e.date::text, e.end_date::text,
		        COALESCE(t_title.translated_text, e.title) AS title,
		        e.event_type, e.icon, e.private_address, e.color,
		        COALESCE(t_notes.translated_text, e.notes) AS notes,
		        e.admin_id, e.created_at, e.updated_at,
		        COALESCE((t_title.id IS NOT NULL AND t_title.is_ai_generated AND t_title.approved_by IS NULL), false)
		        OR
		        COALESCE((t_notes.id IS NOT NULL AND t_notes.is_ai_generated AND t_notes.approved_by IS NULL), false)
		        AS machine_translated
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
		if err := rows.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.Color,
			&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt, &machine); err != nil {
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
// Always returns English source (no locale param). The admin editing flow
// works in the source language; the diff is against the canonical English
// text, not whatever locale the UI happens to be in.
func (r *CalendarRepository) GetEventByID(ctx context.Context, id string) (*model.CalendarEvent, error) {
	var e model.CalendarEvent
	err := r.pool.QueryRow(ctx,
		`SELECT id, date::text, end_date::text, title, event_type, icon, private_address, color, notes, admin_id, created_at, updated_at
		 FROM calendar_events WHERE id = $1`,
		id,
	).Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.Color,
		&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// GetMonthNote returns the sidebar note for a given year+month, or nil if none exists.
// When locale is non-English, content is served via COALESCE from translations.
func (r *CalendarRepository) GetMonthNote(ctx context.Context, year, month int, locale string) (*model.CalendarMonthNote, error) {
	if !calendarLocaleIsLocalized(locale) {
		var n model.CalendarMonthNote
		err := r.pool.QueryRow(ctx,
			`SELECT id, year, month, content, admin_id, created_at, updated_at
			 FROM calendar_month_notes WHERE year = $1 AND month = $2`,
			year, month,
		).Scan(&n.ID, &n.Year, &n.Month, &n.Content, &n.AdminID, &n.CreatedAt, &n.UpdatedAt)
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
		`SELECT mn.id, mn.year, mn.month,
		        COALESCE(t.translated_text, mn.content) AS content,
		        mn.admin_id, mn.created_at, mn.updated_at,
		        COALESCE((t.id IS NOT NULL AND t.is_ai_generated AND t.approved_by IS NULL), false) AS machine_translated
		 FROM calendar_month_notes mn
		 LEFT JOIN translations t
		   ON t.record_id = mn.id AND t.field_name = 'content' AND t.locale = $3
		 WHERE mn.year = $1 AND mn.month = $2`,
		year, month, locale,
	).Scan(&n.ID, &n.Year, &n.Month, &n.Content, &n.AdminID, &n.CreatedAt, &n.UpdatedAt, &machine)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	n.MachineTranslated = machine
	return &n, nil
}

// InsertEvent creates a new calendar event and populates generated fields.
func (r *CalendarRepository) InsertEvent(ctx context.Context, e *model.CalendarEvent) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO calendar_events (date, end_date, title, event_type, icon, private_address, color, notes, admin_id)
		 VALUES ($1::date, $2::date, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, created_at, updated_at`,
		e.Date, e.EndDate, e.Title, e.EventType, e.Icon, e.PrivateAddress, e.Color, e.Notes, e.AdminID,
	).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

// UpdateEvent applies partial updates to a calendar event. Only non-nil fields are changed.
func (r *CalendarRepository) UpdateEvent(ctx context.Context, id string, req *model.UpdateCalendarEventRequest) (*model.CalendarEvent, error) {
	row := r.pool.QueryRow(ctx,
		// end_date is written directly (not COALESCE-guarded like the other
		// fields) so an edit can both set a span AND clear one back to a single
		// day. The EventModal always submits the full event (end_date present as
		// a date or null), so a partial PATCH never accidentally wipes it.
		`UPDATE calendar_events SET
		   date            = COALESCE($2::date,                  date),
		   end_date        = $3::date,
		   title           = COALESCE($4,                        title),
		   event_type      = COALESCE($5::calendar_event_type,   event_type),
		   icon            = COALESCE($6,                        icon),
		   private_address = CASE WHEN $7::boolean THEN $8 ELSE private_address END,
		   color           = COALESCE($9,                        color),
		   notes           = CASE WHEN $10::boolean THEN $11 ELSE notes END,
		   updated_at      = now()
		 WHERE id = $1
		 RETURNING id, date::text, end_date::text, title, event_type, icon, private_address, color, notes, admin_id, created_at, updated_at`,
		id, req.Date, req.EndDate, req.Title, req.EventType, req.Icon,
		req.PrivateAddress != nil, req.PrivateAddress,
		req.Color, req.Notes != nil, req.Notes,
	)
	var e model.CalendarEvent
	err := row.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.Color,
		&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt)
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
func (r *CalendarRepository) UpsertMonthNote(ctx context.Context, year, month int, content string, adminID *string) (*model.CalendarMonthNote, error) {
	var n model.CalendarMonthNote
	err := r.pool.QueryRow(ctx,
		`INSERT INTO calendar_month_notes (year, month, content, admin_id)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (year, month) DO UPDATE
		   SET content = EXCLUDED.content,
		       admin_id = EXCLUDED.admin_id,
		       updated_at = now()
		 RETURNING id, year, month, content, admin_id, created_at, updated_at`,
		year, month, content, adminID,
	).Scan(&n.ID, &n.Year, &n.Month, &n.Content, &n.AdminID, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &n, nil
}
