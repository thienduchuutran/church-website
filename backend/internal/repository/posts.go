package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

type PostRepository struct {
	pool *pgxpool.Pool
}

func NewPostRepository(pool *pgxpool.Pool) *PostRepository {
	return &PostRepository{pool: pool}
}

// InsertPost creates a new post and populates the generated fields (id, created_at, updated_at).
func (r *PostRepository) InsertPost(ctx context.Context, post *model.Post) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO posts (type, title, body, event_date, external_link, admin_id)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at`,
		post.Type, post.Title, post.Body, post.EventDate, post.ExternalLink, post.AdminID,
	).Scan(&post.ID, &post.CreatedAt, &post.UpdatedAt)
}

// GetPosts returns a paginated list of posts, optionally filtered by type and/or tags.
// If tagIDs is non-empty, only gallery_album posts with any of those tags are returned (OR logic).
// If tagIDs is empty, the tag filter is ignored and all posts match (untagged albums still appear).
func (r *PostRepository) GetPosts(ctx context.Context, postType *model.PostType, tagIDs []string, limit, offset int) ([]model.Post, error) {
	query := `SELECT DISTINCT p.id, p.type, p.title, p.body, p.event_date, p.external_link, p.admin_id, p.created_at, p.updated_at
	          FROM posts p`
	args := []any{}
	argIdx := 1

	if len(tagIDs) > 0 {
		query += `
		 LEFT JOIN post_tags pt ON p.id = pt.post_id
		 WHERE p.type = $1 AND pt.tag_id = ANY($2)`
		args = append(args, model.PostTypeGalleryAlbum, tagIDs)
		argIdx = 3
	} else if postType != nil {
		query += fmt.Sprintf(" WHERE p.type = $%d", argIdx)
		args = append(args, *postType)
		argIdx++
	}

	query += " ORDER BY p.created_at DESC"
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []model.Post
	for rows.Next() {
		var p model.Post
		if err := rows.Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

// GetPostByID returns a single post by its ID.
func (r *PostRepository) GetPostByID(ctx context.Context, id string) (*model.Post, error) {
	var p model.Post
	err := r.pool.QueryRow(ctx,
		`SELECT id, type, title, body, event_date, external_link, admin_id, created_at, updated_at
		 FROM posts WHERE id = $1`, id,
	).Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

// UpdatePost partially updates a post. Fields set to nil in the request are left unchanged.
func (r *PostRepository) UpdatePost(ctx context.Context, id string, req model.UpdatePostRequest) (*model.Post, error) {
	var p model.Post
	err := r.pool.QueryRow(ctx,
		`UPDATE posts SET
			title = COALESCE($1, title),
			body = COALESCE($2, body),
			event_date = COALESCE($3, event_date),
			external_link = COALESCE($4, external_link),
			updated_at = now()
		 WHERE id = $5
		 RETURNING id, type, title, body, event_date, external_link, admin_id, created_at, updated_at`,
		req.Title, req.Body, req.EventDate, req.ExternalLink, id,
	).Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

// DeletePost removes a post by ID. Returns ErrNotFound if the post does not exist.
func (r *PostRepository) DeletePost(ctx context.Context, id string) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM posts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return model.ErrNotFound
	}
	return nil
}
