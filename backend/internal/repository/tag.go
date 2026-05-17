package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// TagRepository handles all tag queries.
type TagRepository struct {
	pool *pgxpool.Pool
}

// NewTagRepository creates a new tag repository.
func NewTagRepository(pool *pgxpool.Pool) *TagRepository {
	return &TagRepository{pool: pool}
}

// CreateTag inserts a new tag and returns it. Returns model.ErrAlreadyExists if the name
// already exists (unique constraint violation).
func (r *TagRepository) CreateTag(ctx context.Context, name, createdBy string) (*model.Tag, error) {
	tag := &model.Tag{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO tags (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at, created_by`,
		name, createdBy,
	).Scan(&tag.ID, &tag.Name, &tag.CreatedAt, &tag.CreatedBy)
	if err != nil {
		if err.Error() == "ERROR: duplicate key value violates unique constraint \"tags_name_key\" (SQLSTATE 23505)" {
			return nil, model.ErrAlreadyExists
		}
		return nil, err
	}
	return tag, nil
}

// GetAllTags returns all tags ordered by name.
func (r *TagRepository) GetAllTags(ctx context.Context) ([]model.Tag, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, created_at, created_by FROM tags ORDER BY name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []model.Tag
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.CreatedAt, &tag.CreatedBy); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tags, nil
}

// GetTagsByPostID returns all tags for a given post, ordered by name.
func (r *TagRepository) GetTagsByPostID(ctx context.Context, postID string) ([]model.Tag, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT t.id, t.name, t.created_at, t.created_by
		 FROM tags t
		 INNER JOIN post_tags pt ON t.id = pt.tag_id
		 WHERE pt.post_id = $1
		 ORDER BY t.name`,
		postID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []model.Tag
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.CreatedAt, &tag.CreatedBy); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tags, nil
}

// ReplacePostTags deletes all existing tags for a post and inserts the new ones.
func (r *TagRepository) ReplacePostTags(ctx context.Context, postID string, tagIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM post_tags WHERE post_id = $1`, postID); err != nil {
		return err
	}

	for _, tagID := range tagIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)`, postID, tagID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// RemovePostTag deletes a single tag from a post.
func (r *TagRepository) RemovePostTag(ctx context.Context, postID, tagID string) error {
	result, err := r.pool.Exec(ctx,
		`DELETE FROM post_tags WHERE post_id = $1 AND tag_id = $2`,
		postID, tagID,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return model.ErrNotFound
	}
	return nil
}

// GetPostIDsWithTags returns all post IDs that have any of the given tags.
// Used by the posts service to filter gallery albums by tag.
func (r *TagRepository) GetPostIDsWithTags(ctx context.Context, tagIDs []string) ([]string, error) {
	if len(tagIDs) == 0 {
		return []string{}, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT post_id FROM post_tags WHERE tag_id = ANY($1)`,
		tagIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var postIDs []string
	for rows.Next() {
		var postID string
		if err := rows.Scan(&postID); err != nil {
			return nil, err
		}
		postIDs = append(postIDs, postID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return postIDs, nil
}
