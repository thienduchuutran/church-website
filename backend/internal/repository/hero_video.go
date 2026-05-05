package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

type HeroVideoRepository struct {
	pool *pgxpool.Pool
}

func NewHeroVideoRepository(pool *pgxpool.Pool) *HeroVideoRepository {
	return &HeroVideoRepository{pool: pool}
}

// DeactivateAll sets is_active = false on every existing row. Call this before
// InsertHeroVideo so the partial unique index (only one is_active = true) is
// not violated. A no-op when no rows exist yet (first upload).
func (r *HeroVideoRepository) DeactivateAll(ctx context.Context) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE hero_videos SET is_active = false WHERE is_active = true`,
	)
	return err
}

// InsertHeroVideo writes the new video row and populates v.ID and v.CreatedAt
// from the RETURNING clause. is_active is hard-coded to true - DeactivateAll
// must be called first so the partial unique index does not reject the insert.
func (r *HeroVideoRepository) InsertHeroVideo(ctx context.Context, v *model.HeroVideo) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO hero_videos
		   (storage_key, file_name, file_size, content_type, uploaded_by, is_active)
		 VALUES ($1, $2, $3, $4, $5, true)
		 RETURNING id, created_at`,
		v.StorageKey, v.FileName, v.FileSize, v.ContentType, v.UploadedBy,
	).Scan(&v.ID, &v.CreatedAt)
}

// GetActiveHeroVideo returns the single row where is_active = true.
// Returns model.ErrNotFound when no video has been uploaded yet - the handler
// treats this as a 200 with a null payload so the frontend shows its fallback image.
func (r *HeroVideoRepository) GetActiveHeroVideo(ctx context.Context) (*model.HeroVideo, error) {
	var v model.HeroVideo
	err := r.pool.QueryRow(ctx,
		`SELECT id, storage_key, file_name, file_size, content_type, uploaded_by, is_active, created_at
		 FROM hero_videos
		 WHERE is_active = true
		 LIMIT 1`,
	).Scan(&v.ID, &v.StorageKey, &v.FileName, &v.FileSize, &v.ContentType, &v.UploadedBy, &v.IsActive, &v.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.ErrNotFound
		}
		return nil, err
	}
	return &v, nil
}
