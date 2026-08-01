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
			`SELECT e.id, e.date::text, e.end_date::text, e.title, e.event_type, e.icon, e.private_address, e.address_public, e.place_id, e.color, e.notes, e.admin_id, e.created_at, e.updated_at, e.source_locale,
			        p.address, p.name, p.name_source
			 FROM calendar_events e
			 LEFT JOIN calendar_places p ON p.id = e.place_id
			 WHERE e.date < (make_date($1, $2, 1) + interval '1 month')
			   AND COALESCE(e.end_date, e.date) >= make_date($1, $2, 1)
			 ORDER BY e.date ASC, e.created_at ASC`,
			year, month,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var events []model.CalendarEvent
		for rows.Next() {
			var e model.CalendarEvent
			var pAddress, pName, pSource *string
			if err := rows.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.PlaceID, &e.Color,
				&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt, &e.SourceLocale,
				&pAddress, &pName, &pSource); err != nil {
				return nil, err
			}
			e.Place = buildPlace(e.PlaceID, pAddress, pName, pSource)
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
		        e.event_type, e.icon, e.private_address, e.address_public, e.place_id, e.color,
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
		        e.source_locale,
		        -- The venue, joined rather than stored on the event, so renaming a
		        -- place updates every event at it at once. Never translated: an
		        -- address and a household's name are not prose, same rule that
		        -- keeps private_address out of the translation pipeline.
		        p.address, p.name, p.name_source
		 FROM calendar_events e
		 LEFT JOIN translations t_title
		   ON t_title.record_id = e.id AND t_title.field_name = 'title' AND t_title.locale = $3
		 LEFT JOIN translations t_notes
		   ON t_notes.record_id = e.id AND t_notes.field_name = 'notes' AND t_notes.locale = $3
		 LEFT JOIN calendar_places p ON p.id = e.place_id
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
		var pAddress, pName, pSource *string
		if err := rows.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.PlaceID, &e.Color,
			&e.Notes, &e.AdminID, &e.CreatedAt, &e.UpdatedAt, &machine, &e.TitleSource, &e.NotesSource, &e.SourceLocale,
			&pAddress, &pName, &pSource); err != nil {
			return nil, err
		}
		e.MachineTranslated = machine
		e.Place = buildPlace(e.PlaceID, pAddress, pName, pSource)
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
		`SELECT id, date::text, end_date::text, title, event_type, icon, private_address, address_public, place_id, color, notes, admin_id, created_at, updated_at, source_locale
		 FROM calendar_events WHERE id = $1`,
		id,
	).Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.PlaceID, &e.Color,
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
		`INSERT INTO calendar_events (date, end_date, title, event_type, icon, private_address, address_public, place_id, color, notes, admin_id, source_locale)
		 VALUES ($1::date, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, created_at, updated_at`,
		e.Date, e.EndDate, e.Title, e.EventType, e.Icon, e.PrivateAddress, e.AddressPublic, e.PlaceID, e.Color, e.Notes, e.AdminID, e.SourceLocale,
	).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

// UpdateEvent applies partial updates to a calendar event. Only non-nil fields
// are changed.
//
// sourceLocale is an explicit parameter rather than read off req because the
// service resolves it (explicit admin choice, else re-detection, else the value
// already stored) and the repository should not re-litigate that decision. It is
// always a concrete value, so it is written unconditionally.
//
// placeID is an explicit parameter for the same reason - the service resolves
// the address to a venue (and may have created one) before this runs. Unlike
// sourceLocale it is guarded by the SAME boolean as private_address, because the
// two are one fact: if this PATCH did not submit an address, it must not touch
// which place the event belongs to either.
func (r *CalendarRepository) UpdateEvent(ctx context.Context, id string, req *model.UpdateCalendarEventRequest, sourceLocale string, placeID *string) (*model.CalendarEvent, error) {
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
		   -- Same guard as private_address above, deliberately sharing $7: the
		   -- place is derived from the address, so an edit that leaves the
		   -- address alone must leave the venue alone too. Writing this
		   -- unconditionally would blank place_id on every date-only PATCH.
		   place_id        = CASE WHEN $7::boolean THEN $14::uuid ELSE place_id END,
		   color           = COALESCE($9,                        color),
		   notes           = CASE WHEN $10::boolean THEN $11 ELSE notes END,
		   address_public  = $12,
		   source_locale   = $13,
		   updated_at      = now()
		 WHERE id = $1
		 RETURNING id, date::text, end_date::text, title, event_type, icon, private_address, address_public, place_id, color, notes, admin_id, created_at, updated_at, source_locale`,
		id, req.Date, req.EndDate, req.Title, req.EventType, req.Icon,
		req.PrivateAddress != nil, req.PrivateAddress,
		req.Color, req.Notes != nil, req.Notes,
		req.AddressPublic, sourceLocale, placeID,
	)
	var e model.CalendarEvent
	err := row.Scan(&e.ID, &e.Date, &e.EndDate, &e.Title, &e.EventType, &e.Icon, &e.PrivateAddress, &e.AddressPublic, &e.PlaceID, &e.Color,
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

// buildPlace assembles the joined venue columns into a CalendarPlace, or nil
// when the event has no place.
//
// Both month-read paths LEFT JOIN calendar_places, so every column comes back
// nullable and the nil check has to be on the join succeeding, not on the FK
// alone - a place_id pointing at a row that is somehow gone must produce no
// place rather than a half-built one with an empty name.
func buildPlace(placeID, address, name, nameSource *string) *model.CalendarPlace {
	if placeID == nil || address == nil || name == nil {
		return nil
	}
	p := &model.CalendarPlace{ID: *placeID, Address: *address, Name: *name}
	if nameSource != nil {
		p.NameSource = *nameSource
	}
	return p
}

// --- Places (the venue registry behind the Locations strip) ---

// placeColumns is the one place the column list lives, so the three queries
// below cannot drift apart. address_key is deliberately absent: it is a matching
// detail that never leaves this package.
const placeColumns = `id, address, name, name_source, created_at, updated_at`

// GetPlaceByKey looks up a venue by its normalized address. Returns ErrNotFound
// when this address has never been seen.
//
// This is the hot path and the reason the places table exists: every event at an
// already-known address resolves through a single primary-key-ish lookup and
// never reaches the model.
func (r *CalendarRepository) GetPlaceByKey(ctx context.Context, addressKey string) (*model.CalendarPlace, error) {
	var p model.CalendarPlace
	err := r.pool.QueryRow(ctx,
		`SELECT `+placeColumns+` FROM calendar_places WHERE address_key = $1`,
		addressKey,
	).Scan(&p.ID, &p.Address, &p.Name, &p.NameSource, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// GetPlaceByID looks up a venue by its primary key. Used on the write path to
// expand the place onto a create/update response, so the API shape of an event
// is the same whether it came from a month read or a PATCH.
func (r *CalendarRepository) GetPlaceByID(ctx context.Context, id string) (*model.CalendarPlace, error) {
	var p model.CalendarPlace
	err := r.pool.QueryRow(ctx,
		`SELECT `+placeColumns+` FROM calendar_places WHERE id = $1`, id,
	).Scan(&p.ID, &p.Address, &p.Name, &p.NameSource, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// CreatePlaceIfAbsent inserts a venue keyed by addressKey. The bool reports
// whether this call actually created the row.
//
// False means a concurrent request won the race and already owns this address;
// the caller re-reads rather than treating it as an error. That distinction is
// what stops two events saved at the same moment from both asking the model to
// name one address - the loser of the race simply adopts the winner's place.
//
// ON CONFLICT DO NOTHING rather than DO UPDATE: an existing place's name and
// address belong to whoever wrote them (possibly an admin), and a later event
// mentioning the same address is not a reason to overwrite either.
func (r *CalendarRepository) CreatePlaceIfAbsent(ctx context.Context, addressKey, address, name string) (*model.CalendarPlace, bool, error) {
	var p model.CalendarPlace
	err := r.pool.QueryRow(ctx,
		`INSERT INTO calendar_places (address_key, address, name)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (address_key) DO NOTHING
		 RETURNING `+placeColumns,
		addressKey, address, name,
	).Scan(&p.ID, &p.Address, &p.Name, &p.NameSource, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &p, true, nil
}

// UpdatePlaceNameFromAI stores a model-derived name, but only over a name the
// model itself wrote.
//
// The `name_source = 'ai'` predicate is the whole point: an admin who renames a
// place has made a decision, and a naming call still in flight from another
// event must not quietly undo it. A no-op update is a success, not an error -
// "the admin already named it" is the expected outcome, not a failure.
func (r *CalendarRepository) UpdatePlaceNameFromAI(ctx context.Context, id, name string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE calendar_places
		    SET name = $2, updated_at = now()
		  WHERE id = $1 AND name_source = $3`,
		id, name, model.PlaceNameSourceAI,
	)
	return err
}

// ListPlaceNames returns the venue names already in use, most-used first. Fed to
// the model as context so a new place is named consistently with the vocabulary
// the church already reads ("Church", not "Main St Building").
func (r *CalendarRepository) ListPlaceNames(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.name
		   FROM calendar_places p
		   LEFT JOIN calendar_events e ON e.place_id = p.id
		  GROUP BY p.id, p.name
		  ORDER BY count(e.id) DESC, p.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := []string{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		names = append(names, n)
	}
	return names, rows.Err()
}

// ListPlaces returns every venue with how many events use it. Backs the
// admin-only places endpoint (the event form's suggestions), so the ordering is
// "what you most likely want" rather than alphabetical.
func (r *CalendarRepository) ListPlaces(ctx context.Context) ([]model.CalendarPlace, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.address, p.name, p.name_source, p.created_at, p.updated_at, count(e.id) AS event_count
		   FROM calendar_places p
		   LEFT JOIN calendar_events e ON e.place_id = p.id
		  GROUP BY p.id
		  ORDER BY count(e.id) DESC, p.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	places := []model.CalendarPlace{}
	for rows.Next() {
		var p model.CalendarPlace
		if err := rows.Scan(&p.ID, &p.Address, &p.Name, &p.NameSource,
			&p.CreatedAt, &p.UpdatedAt, &p.EventCount); err != nil {
			return nil, err
		}
		places = append(places, p)
	}
	return places, rows.Err()
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
