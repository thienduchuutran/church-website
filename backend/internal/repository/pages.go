package repository

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// PageRepository handles raw SQL queries for the page_content table.
type PageRepository struct {
	pool *pgxpool.Pool
}

func NewPageRepository(pool *pgxpool.Pool) *PageRepository {
	return &PageRepository{pool: pool}
}

// pageLocaleIsLocalized mirrors isLocalized in posts.go but is duplicated here
// to keep the package surface small. Both ignore "" and "en" because English
// is the source of truth - never translated.
func pageLocaleIsLocalized(locale string) bool {
	locale = strings.TrimSpace(locale)
	return locale != "" && locale != "en"
}

// GetSections returns all section key-value pairs for a given page slug.
//
// When locale is non-English, content is served via COALESCE from the
// translations table; missing translations fall back to the English source.
// machineTranslated is true when at least one returned section came from an
// unapproved AI translation.
func (r *PageRepository) GetSections(ctx context.Context, slug, locale string) (map[string]string, bool, error) {
	if !pageLocaleIsLocalized(locale) {
		rows, err := r.pool.Query(ctx,
			`SELECT section_key, content FROM page_content WHERE page_slug = $1`,
			slug,
		)
		if err != nil {
			return nil, false, err
		}
		defer rows.Close()

		sections := make(map[string]string)
		for rows.Next() {
			var key, content string
			if err := rows.Scan(&key, &content); err != nil {
				return nil, false, err
			}
			sections[key] = content
		}
		return sections, false, rows.Err()
	}

	rows, err := r.pool.Query(ctx,
		`SELECT pc.section_key,
		        COALESCE(t.translated_text, pc.content) AS content,
		        COALESCE((t.id IS NOT NULL AND t.is_ai_generated AND t.approved_by IS NULL), false) AS machine_translated
		 FROM page_content pc
		 LEFT JOIN translations t
		   ON t.record_id = pc.id AND t.field_name = 'content' AND t.locale = $2
		 WHERE pc.page_slug = $1`,
		slug, locale,
	)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	sections := make(map[string]string)
	anyMachine := false
	for rows.Next() {
		var (
			key, content string
			machine      bool
		)
		if err := rows.Scan(&key, &content, &machine); err != nil {
			return nil, false, err
		}
		sections[key] = content
		if machine {
			anyMachine = true
		}
	}
	return sections, anyMachine, rows.Err()
}

// GetSectionsDetail returns the rows of page_content for a slug, including
// the row UUIDs. Used by PageService to enqueue translation jobs after an
// upsert: translation_jobs.record_id is the page_content.id and the service
// needs to know that id per section.
func (r *PageRepository) GetSectionsDetail(ctx context.Context, slug string) ([]model.PageContent, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, page_slug, section_key, content, updated_at
		 FROM page_content WHERE page_slug = $1`,
		slug,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.PageContent
	for rows.Next() {
		var pc model.PageContent
		if err := rows.Scan(&pc.ID, &pc.PageSlug, &pc.SectionKey, &pc.Content, &pc.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, pc)
	}
	return out, rows.Err()
}

// UpsertSections inserts or updates multiple section key-value pairs for a page slug.
func (r *PageRepository) UpsertSections(ctx context.Context, slug string, sections map[string]string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for key, content := range sections {
		_, err := tx.Exec(ctx,
			`INSERT INTO page_content (page_slug, section_key, content, updated_at)
			 VALUES ($1, $2, $3, now())
			 ON CONFLICT (page_slug, section_key)
			 DO UPDATE SET content = $3, updated_at = now()`,
			slug, key, content,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
