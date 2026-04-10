package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PageRepository handles raw SQL queries for the page_content table.
type PageRepository struct {
	pool *pgxpool.Pool
}

func NewPageRepository(pool *pgxpool.Pool) *PageRepository {
	return &PageRepository{pool: pool}
}

// GetSections returns all section key-value pairs for a given page slug.
func (r *PageRepository) GetSections(ctx context.Context, slug string) (map[string]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT section_key, content FROM page_content WHERE page_slug = $1`,
		slug,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sections := make(map[string]string)
	for rows.Next() {
		var key, content string
		if err := rows.Scan(&key, &content); err != nil {
			return nil, err
		}
		sections[key] = content
	}
	return sections, rows.Err()
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
