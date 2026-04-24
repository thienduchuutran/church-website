package repository

import (
	"context"
	"errors"

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

// GetEventsByMonth returns all calendar events for the given year and month.
func (r *CalendarRepository) GetEventsByMonth(ctx context.Context, year, month int) ([]model.CalendarEvent, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, date::text, title, event_type, icon, color, notes, admin_id, created_at, updated_at
		 FROM calendar_events
		 WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
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
		if err := rows.Scan(&e.ID, &e.Date, &e.Title, &e.EventType, &e.Icon, &e.Color,
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

// GetMonthNote returns the sidebar note for a given year+month, or nil if none exists.
func (r *CalendarRepository) GetMonthNote(ctx context.Context, year, month int) (*model.CalendarMonthNote, error) {
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

// InsertEvent creates a new calendar event and populates generated fields.
func (r *CalendarRepository) InsertEvent(ctx context.Context, e *model.CalendarEvent) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO calendar_events (date, title, event_type, icon, color, notes, admin_id)
		 VALUES ($1::date, $2, $3, $4, $5, $6, $7)
		 RETURNING id, created_at, updated_at`,
		e.Date, e.Title, e.EventType, e.Icon, e.Color, e.Notes, e.AdminID,
	).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

// UpdateEvent applies partial updates to a calendar event. Only non-nil fields are changed.
func (r *CalendarRepository) UpdateEvent(ctx context.Context, id string, req *model.UpdateCalendarEventRequest) (*model.CalendarEvent, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE calendar_events SET
		   date       = COALESCE($2::date,       date),
		   title      = COALESCE($3,             title),
		   event_type = COALESCE($4::calendar_event_type, event_type),
		   icon       = COALESCE($5,             icon),
		   color      = COALESCE($6,             color),
		   notes      = CASE WHEN $7::boolean THEN $8 ELSE notes END,
		   updated_at = now()
		 WHERE id = $1
		 RETURNING id, date::text, title, event_type, icon, color, notes, admin_id, created_at, updated_at`,
		id, req.Date, req.Title, req.EventType, req.Icon, req.Color,
		req.Notes != nil, req.Notes,
	)
	var e model.CalendarEvent
	err := row.Scan(&e.ID, &e.Date, &e.Title, &e.EventType, &e.Icon, &e.Color,
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
