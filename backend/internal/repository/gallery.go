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
		`INSERT INTO post_images (post_id, storage_url, display_order)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		img.PostID, img.StorageURL, img.DisplayOrder,
	).Scan(&img.ID)
}

// GetImagesByPostID returns all images for a given post, ordered by display_order.
func (r *GalleryRepository) GetImagesByPostID(ctx context.Context, postID string) ([]model.PostImage, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, post_id, storage_url, display_order
		 FROM post_images WHERE post_id = $1
		 ORDER BY display_order`,
		postID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var images []model.PostImage
	for rows.Next() {
		var img model.PostImage
		if err := rows.Scan(&img.ID, &img.PostID, &img.StorageURL, &img.DisplayOrder); err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, rows.Err()
}
