package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

type GalleryRepository struct {
	pool *pgxpool.Pool
}

func NewGalleryRepository(pool *pgxpool.Pool) *GalleryRepository {
	return &GalleryRepository{pool: pool}
}

// InsertPostImage adds an image record linked to a post.
func (r *GalleryRepository) InsertPostImage(ctx context.Context, img *model.PostImage) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO post_images (post_id, storage_key, display_order)
		VALUES ($1, $2, $3)
		RETURNING id`,
		img.PostID, img.StorageKey, img.DisplayOrder,
	).Scan(&img.ID)
}

// GetImagesByPostIDs batch-loads images for a set of post ids and groups them by post_id.
// One query covers both the list endpoint (many posts) and the get endpoint
// (one post called with a length-1 slice), so we do not keep a separate
// single-post variant — that path was removed when this function landed.
// Returns an empty map (not nil) when no ids are supplied so callers can skip a nil-check.
func (r *GalleryRepository) GetImagesByPostIDs(ctx context.Context, postIDs []string) (map[string][]model.PostImage, error) {
	out := make(map[string][]model.PostImage)
	if len(postIDs) == 0 {
		return out, nil
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, post_id, storage_key, display_order
		FROM post_images WHERE post_id = ANY($1)
		ORDER BY post_id, display_order`,
		postIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var img model.PostImage
		if err := rows.Scan(&img.ID, &img.PostID, &img.StorageKey, &img.DisplayOrder); err != nil {
			return nil, err
		}
		out[img.PostID] = append(out[img.PostID], img)
	}
	return out, rows.Err()
}
