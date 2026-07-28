package repository

import (
	"context"
	"fmt"
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

// GetBlocks returns all blocks for a page slug, ordered by position, with
// locale-aware title and content via COALESCE joins on the translations table.
// machineTranslated is true when at least one block's title or content was
// served from an unapproved AI translation.
func (r *PageRepository) GetBlocks(ctx context.Context, slug, locale string) ([]model.PageBlock, bool, error) {
	if !pageLocaleIsLocalized(locale) {
		return r.getBlocksEnglish(ctx, slug)
	}
	return r.getBlocksLocalized(ctx, slug, locale)
}

// getBlocksEnglish reads blocks in English (no translation joins).
func (r *PageRepository) getBlocksEnglish(ctx context.Context, slug string) ([]model.PageBlock, bool, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, block_type, position, title, content, props
		 FROM page_content
		 WHERE page_slug = $1
		 ORDER BY position`,
		slug,
	)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var blocks []model.PageBlock
	for rows.Next() {
		var b model.PageBlock
		if err := rows.Scan(&b.ID, &b.BlockType, &b.Position, &b.Title, &b.Content, &b.Props); err != nil {
			return nil, false, err
		}
		if b.Props == nil {
			b.Props = map[string]any{}
		}
		blocks = append(blocks, b)
	}
	return blocks, false, rows.Err()
}

// getBlocksLocalized reads blocks with two COALESCE joins for title and content.
func (r *PageRepository) getBlocksLocalized(ctx context.Context, slug, locale string) ([]model.PageBlock, bool, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT
		   pc.id,
		   pc.block_type,
		   pc.position,
		   COALESCE(tt.translated_text, pc.title)   AS title,
		   COALESCE(tc.translated_text, pc.content)  AS content,
		   pc.props,
		   COALESCE(
		     (tt.id IS NOT NULL AND tt.is_ai_generated AND tt.approved_by IS NULL),
		     false
		   ) OR COALESCE(
		     (tc.id IS NOT NULL AND tc.is_ai_generated AND tc.approved_by IS NULL),
		     false
		   ) AS machine_translated
		 FROM page_content pc
		 LEFT JOIN translations tt
		   ON tt.record_id = pc.id AND tt.field_name = 'title' AND tt.locale = $2
		 LEFT JOIN translations tc
		   ON tc.record_id = pc.id AND tc.field_name = 'content' AND tc.locale = $2
		 WHERE pc.page_slug = $1
		 ORDER BY pc.position`,
		slug, locale,
	)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var blocks []model.PageBlock
	anyMachine := false
	for rows.Next() {
		var (
			b       model.PageBlock
			machine bool
		)
		if err := rows.Scan(&b.ID, &b.BlockType, &b.Position, &b.Title, &b.Content, &b.Props, &machine); err != nil {
			return nil, false, err
		}
		if b.Props == nil {
			b.Props = map[string]any{}
		}
		b.MachineTranslated = machine
		if machine {
			anyMachine = true
		}
		blocks = append(blocks, b)
	}
	return blocks, anyMachine, rows.Err()
}

// ReplaceBlocks performs a full replace of blocks for a page slug inside a
// single transaction: upsert rows present in the payload, delete rows for
// that slug absent from the payload (plus their translations and pending
// translation_jobs). New blocks get a server-generated section_key.
//
// This is the "remove a section" capability: blocks not in the payload are
// gone. blocks:[] is rejected at the handler level before this is called.
func (r *PageRepository) ReplaceBlocks(ctx context.Context, slug string, blocks []model.PageBlock) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Collect IDs of blocks in the payload (existing rows being kept/updated).
	keepIDs := make([]string, 0, len(blocks))

	for i, b := range blocks {
		if b.ID != "" {
			// Existing block: update in place.
			_, err := tx.Exec(ctx,
				`UPDATE page_content
				 SET block_type  = $1,
				     position    = $2,
				     title       = $3,
				     content     = $4,
				     props       = $5,
				     updated_at  = now()
				 WHERE id = $6 AND page_slug = $7`,
				b.BlockType, i, b.Title, b.Content, b.Props, b.ID, slug,
			)
			if err != nil {
				return err
			}
			keepIDs = append(keepIDs, b.ID)
		} else {
			// New block: insert with a generated section_key.
			sectionKey := generateSectionKey(b.Title, b.BlockType, i)
			var newID string
			err := tx.QueryRow(ctx,
				`INSERT INTO page_content (page_slug, section_key, block_type, position, title, content, props, updated_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, now())
				 RETURNING id`,
				slug, sectionKey, b.BlockType, i, b.Title, b.Content, b.Props,
			).Scan(&newID)
			if err != nil {
				return err
			}
			keepIDs = append(keepIDs, newID)
		}
	}

	// Delete translations and pending jobs for rows about to be removed.
	_, err = tx.Exec(ctx,
		`DELETE FROM translations
		 WHERE table_name = 'page_content'
		   AND record_id IN (
		     SELECT id FROM page_content
		     WHERE page_slug = $1
		       AND NOT (id = ANY($2))
		   )`,
		slug, keepIDs,
	)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`DELETE FROM translation_jobs
		 WHERE table_name = 'page_content'
		   AND status = 'pending'
		   AND record_id IN (
		     SELECT id FROM page_content
		     WHERE page_slug = $1
		       AND NOT (id = ANY($2))
		   )`,
		slug, keepIDs,
	)
	if err != nil {
		return err
	}

	// Delete the absent rows themselves.
	_, err = tx.Exec(ctx,
		`DELETE FROM page_content
		 WHERE page_slug = $1
		   AND NOT (id = ANY($2))`,
		slug, keepIDs,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// generateSectionKey produces a human-readable, slug-like key from a block's
// title (e.g. "Our Mission" → "our-mission"). Falls back to block_type + index
// when title is empty. Immutable after creation - the UUID is the identity;
// section_key is just the human label shown in /admin/translations.
func generateSectionKey(title, blockType string, index int) string {
	if title == "" {
		return fmt.Sprintf("%s-%d", blockType, index)
	}
	// Simple slugification: lowercase, replace non-alphanumeric with dash, trim.
	slug := strings.ToLower(strings.TrimSpace(title))
	var buf strings.Builder
	prevDash := false
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			buf.WriteRune(r)
			prevDash = false
		} else if !prevDash && buf.Len() > 0 {
			buf.WriteByte('-')
			prevDash = true
		}
	}
	result := strings.TrimRight(buf.String(), "-")
	if result == "" {
		return fmt.Sprintf("%s-%d", blockType, index)
	}
	// Cap at 60 chars to keep it readable.
	if len(result) > 60 {
		result = result[:60]
	}
	return result
}
