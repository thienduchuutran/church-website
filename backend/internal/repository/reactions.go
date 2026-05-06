package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

type ReactionRepository struct {
	pool *pgxpool.Pool
}

func NewReactionRepository(pool *pgxpool.Pool) *ReactionRepository {
	return &ReactionRepository{pool: pool}
}

// UpsertReaction inserts a new reaction or updates the emoji if one already exists for (post_id, fingerprint).
func (r *ReactionRepository) UpsertReaction(ctx context.Context, postID, emoji, fingerprint string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO reactions (post_id, emoji, fingerprint)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (post_id, fingerprint)
		 DO UPDATE SET emoji = $2`,
		postID, emoji, fingerprint,
	)
	return err
}

// GetReactionCounts returns the count of each emoji for a given post.
func (r *ReactionRepository) GetReactionCounts(ctx context.Context, postID string) ([]model.ReactionCount, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT emoji, COUNT(*)::int AS count FROM reactions WHERE post_id = $1 GROUP BY emoji`,
		postID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var counts []model.ReactionCount
	for rows.Next() {
		var rc model.ReactionCount
		if err := rows.Scan(&rc.Emoji, &rc.Count); err != nil {
			return nil, err
		}
		counts = append(counts, rc)
	}
	return counts, rows.Err()
}

// DeleteReaction removes a reaction by post_id and fingerprint.
func (r *ReactionRepository) DeleteReaction(ctx context.Context, postID, fingerprint string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM reactions WHERE post_id = $1 AND fingerprint = $2`,
		postID, fingerprint,
	)
	return err
}

// GetMyReaction returns the emoji this fingerprint has reacted with on a post, or nil if none.
func (r *ReactionRepository) GetMyReaction(ctx context.Context, postID, fingerprint string) (*string, error) {
	var emoji string
	err := r.pool.QueryRow(ctx,
		`SELECT emoji FROM reactions WHERE post_id = $1 AND fingerprint = $2`,
		postID, fingerprint,
	).Scan(&emoji)
	if err != nil {
		// pgx.ErrNoRows means the fingerprint hasn't reacted yet - not an error.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &emoji, nil
}
