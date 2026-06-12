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

// TranslationRepository owns admin-side queries against the `translations`
// table. The public read path uses COALESCE joins inside posts.go /
// calendar.go / pages.go, not this repository - those queries are
// per-record-type. This file is purely for the admin review panel where
// translations are listed as their own rows.
type TranslationRepository struct {
	pool *pgxpool.Pool
}

func NewTranslationRepository(pool *pgxpool.Pool) *TranslationRepository {
	return &TranslationRepository{pool: pool}
}

// TranslationListFilters narrows the result set. Approved is tri-state:
// nil = both, false = pending review, true = already human-approved.
type TranslationListFilters struct {
	Locale   string
	Approved *bool
	Limit    int
	Offset   int
}

// translationSelectColumns returns the SELECT clause used for both the list
// and single-row fetch. record_title is a CASE expression that LEFT JOINs to
// each possible parent table and picks the right human label. We embed it
// here rather than as a view so the schema migrations stay single-file and
// the synthesis logic lives next to the only code that uses it.
const translationSelectColumns = `
  t.id, t.table_name, t.record_id, t.field_name, t.locale,
  t.source_text, t.translated_text, t.is_ai_generated,
  t.approved_by, t.approved_at, t.created_at, t.updated_at,
  COALESCE(
    CASE t.table_name
      WHEN 'posts'                THEN p.title
      WHEN 'page_content'         THEN pc.page_slug || ' / ' || pc.section_key
      WHEN 'calendar_events'      THEN ce.title || ' · ' || ce.date::text
      WHEN 'calendar_month_notes' THEN 'Month note · ' || cmn.year || '-' || LPAD(cmn.month::text, 2, '0')
    END,
    -- Parent row was deleted but the translation lingers. Surface it with a
    -- recognizable label; the reviewer clears these with the "Clean up
    -- orphans" button (DeleteOrphanedTranslations below).
    t.table_name || ':' || LEFT(t.record_id::text, 8)
  ) AS record_title`

// translationFromClause is the joined FROM for list queries. Each LEFT JOIN
// is no-op when t.table_name doesn't match - Postgres optimizer handles the
// "this row's record_id can never match this table" cases efficiently.
const translationFromClause = `
  FROM translations t
  LEFT JOIN posts                p   ON t.table_name = 'posts'                AND t.record_id = p.id
  LEFT JOIN page_content         pc  ON t.table_name = 'page_content'         AND t.record_id = pc.id
  LEFT JOIN calendar_events      ce  ON t.table_name = 'calendar_events'      AND t.record_id = ce.id
  LEFT JOIN calendar_month_notes cmn ON t.table_name = 'calendar_month_notes' AND t.record_id = cmn.id`

// List returns paginated translations matching the filters, plus the total
// count (without the LIMIT/OFFSET) so the frontend can render pagination
// controls without a second roundtrip.
func (r *TranslationRepository) List(ctx context.Context, f TranslationListFilters) ([]model.TranslationListItem, int, error) {
	wheres := []string{"1=1"}
	args := []any{}
	argIdx := 1

	if f.Locale != "" {
		wheres = append(wheres, fmt.Sprintf("t.locale = $%d", argIdx))
		args = append(args, f.Locale)
		argIdx++
	}
	if f.Approved != nil {
		if *f.Approved {
			wheres = append(wheres, "t.approved_by IS NOT NULL")
		} else {
			wheres = append(wheres, "t.approved_by IS NULL")
		}
	}
	whereClause := strings.Join(wheres, " AND ")

	// Count query first. Counting via a subquery would be cleaner but the
	// JOINs are needed regardless for the data query, and counting the
	// translations table alone (without joins) is fine for total - we want
	// the count of matching translations, not "translations whose parent
	// still exists."
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM translations t WHERE `+whereClause, args...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count translations: %w", err)
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 20
	}
	args = append(args, limit, f.Offset)
	limitIdx := argIdx
	offsetIdx := argIdx + 1

	query := `SELECT ` + translationSelectColumns + translationFromClause + `
	          WHERE ` + whereClause + `
	          ORDER BY t.created_at DESC
	          LIMIT $` + fmt.Sprint(limitIdx) + ` OFFSET $` + fmt.Sprint(offsetIdx)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list translations: %w", err)
	}
	defer rows.Close()

	var items []model.TranslationListItem
	for rows.Next() {
		var it model.TranslationListItem
		if err := rows.Scan(
			&it.ID, &it.TableName, &it.RecordID, &it.FieldName, &it.Locale,
			&it.SourceText, &it.TranslatedText, &it.IsAIGenerated,
			&it.ApprovedBy, &it.ApprovedAt, &it.CreatedAt, &it.UpdatedAt,
			&it.RecordTitle,
		); err != nil {
			return nil, 0, fmt.Errorf("scan translation: %w", err)
		}
		items = append(items, it)
	}
	return items, total, rows.Err()
}

// GetByID fetches one translation. Used by the retranslate handler to read
// the source_text before deleting the row and re-enqueueing.
func (r *TranslationRepository) GetByID(ctx context.Context, id string) (*model.Translation, error) {
	var t model.Translation
	err := r.pool.QueryRow(ctx,
		`SELECT id, table_name, record_id, field_name, locale,
		        source_text, translated_text, is_ai_generated,
		        approved_by, approved_at, created_at, updated_at
		 FROM translations WHERE id = $1`, id,
	).Scan(&t.ID, &t.TableName, &t.RecordID, &t.FieldName, &t.Locale,
		&t.SourceText, &t.TranslatedText, &t.IsAIGenerated,
		&t.ApprovedBy, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Approve marks a translation as human-reviewed. When translatedText is
// non-nil, the text is also updated (the reviewer made edits). When nil, the
// AI output is kept as-is and only approved_by/approved_at are touched.
//
// Critically, this also sets is_ai_generated = false ONLY when text was edited.
// An approve-as-is keeps is_ai_generated=true because the AI did produce
// the text; the human just signed off on it.
func (r *TranslationRepository) Approve(ctx context.Context, id, approverID string, translatedText *string) (*model.Translation, error) {
	var t model.Translation
	var err error
	if translatedText != nil {
		err = r.pool.QueryRow(ctx,
			`UPDATE translations SET
			    translated_text = $1,
			    is_ai_generated = false,
			    approved_by = $2,
			    approved_at = now(),
			    updated_at = now()
			 WHERE id = $3
			 RETURNING id, table_name, record_id, field_name, locale,
			           source_text, translated_text, is_ai_generated,
			           approved_by, approved_at, created_at, updated_at`,
			*translatedText, approverID, id,
		).Scan(&t.ID, &t.TableName, &t.RecordID, &t.FieldName, &t.Locale,
			&t.SourceText, &t.TranslatedText, &t.IsAIGenerated,
			&t.ApprovedBy, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt)
	} else {
		err = r.pool.QueryRow(ctx,
			`UPDATE translations SET
			    approved_by = $1,
			    approved_at = now(),
			    updated_at = now()
			 WHERE id = $2
			 RETURNING id, table_name, record_id, field_name, locale,
			           source_text, translated_text, is_ai_generated,
			           approved_by, approved_at, created_at, updated_at`,
			approverID, id,
		).Scan(&t.ID, &t.TableName, &t.RecordID, &t.FieldName, &t.Locale,
			&t.SourceText, &t.TranslatedText, &t.IsAIGenerated,
			&t.ApprovedBy, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Delete removes a translation row. Used by the retranslate path - delete
// the existing translation so COALESCE on the public read path falls back to
// English while the worker produces a fresh one.
func (r *TranslationRepository) Delete(ctx context.Context, id string) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM translations WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return model.ErrNotFound
	}
	return nil
}

// DeleteUnapproved atomically deletes every unapproved translation and
// returns the deleted rows so the caller can re-enqueue jobs. Approved
// translations (approved_by IS NOT NULL) are deliberately left intact - the
// reviewer's edits are sacred and a prompt change must not auto-clobber them.
//
// This is the bulk side of the per-row Retranslate flow: same shape, same
// safety property (public reads fall back to English via COALESCE during the
// gap), batched in a single DELETE ... RETURNING so a partial failure can't
// leave the queue half-flushed.
func (r *TranslationRepository) DeleteUnapproved(ctx context.Context) ([]model.Translation, error) {
	rows, err := r.pool.Query(ctx,
		`DELETE FROM translations
		 WHERE approved_by IS NULL
		 RETURNING id, table_name, record_id, field_name, locale,
		           source_text, translated_text, is_ai_generated,
		           approved_by, approved_at, created_at, updated_at`,
	)
	if err != nil {
		return nil, fmt.Errorf("delete unapproved translations: %w", err)
	}
	defer rows.Close()

	var deleted []model.Translation
	for rows.Next() {
		var t model.Translation
		if err := rows.Scan(
			&t.ID, &t.TableName, &t.RecordID, &t.FieldName, &t.Locale,
			&t.SourceText, &t.TranslatedText, &t.IsAIGenerated,
			&t.ApprovedBy, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan deleted translation: %w", err)
		}
		deleted = append(deleted, t)
	}
	return deleted, rows.Err()
}

// orphanConditions matches rows whose parent record no longer exists, checked
// per known parent table. Deliberately a whitelist: a table_name this clause
// does not recognize is NEVER treated as an orphan, so translations for a
// future content type added before this list learns about it are left intact
// rather than swept by mistake. Written with %s-substituted aliases so the
// same conditions serve both the translations and translation_jobs deletes.
const orphanConditions = `
     (%[1]s.table_name = 'posts'                AND NOT EXISTS (SELECT 1 FROM posts                p   WHERE p.id   = %[1]s.record_id))
  OR (%[1]s.table_name = 'page_content'         AND NOT EXISTS (SELECT 1 FROM page_content         pc  WHERE pc.id  = %[1]s.record_id))
  OR (%[1]s.table_name = 'calendar_events'      AND NOT EXISTS (SELECT 1 FROM calendar_events      ce  WHERE ce.id  = %[1]s.record_id))
  OR (%[1]s.table_name = 'calendar_month_notes' AND NOT EXISTS (SELECT 1 FROM calendar_month_notes cmn WHERE cmn.id = %[1]s.record_id))`

// DeleteOrphanedTranslations removes translations whose parent record has
// been deleted. The translations table has no FKs by design (it serves many
// parent tables), so deletes on posts/pages/events leave rows behind; this is
// the out-of-band sweep the schema comments promise. Approval status is
// irrelevant here - an approved translation of a deleted post serves nothing.
// (fine_tuning_examples is deliberately NOT swept: captured training pairs
// must survive parent deletion.)
func (r *TranslationRepository) DeleteOrphanedTranslations(ctx context.Context) (int, error) {
	ct, err := r.pool.Exec(ctx,
		`DELETE FROM translations t WHERE `+fmt.Sprintf(orphanConditions, "t"))
	if err != nil {
		return 0, fmt.Errorf("delete orphaned translations: %w", err)
	}
	return int(ct.RowsAffected()), nil
}

// DeleteOrphanedPendingJobs removes pending queue rows whose parent record has
// been deleted. Without this, the worker would translate the dead job ~5s
// after a sweep and re-create the very orphan that was just cleaned. Only
// status='pending' is touched: done/failed rows stay as audit history (the
// established translation_jobs convention), and 'processing' rows are left
// for the worker to finish - a rare race the next sweep catches.
func (r *TranslationRepository) DeleteOrphanedPendingJobs(ctx context.Context) (int, error) {
	ct, err := r.pool.Exec(ctx,
		`DELETE FROM translation_jobs j WHERE j.status = 'pending' AND (`+fmt.Sprintf(orphanConditions, "j")+`)`)
	if err != nil {
		return 0, fmt.Errorf("delete orphaned pending jobs: %w", err)
	}
	return int(ct.RowsAffected()), nil
}
