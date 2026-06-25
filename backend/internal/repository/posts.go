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

// isLocalized reports whether a locale string asks for non-English content.
// "" and "en" both bypass the translation joins - English is the source of truth.
func isLocalized(locale string) bool {
	locale = strings.TrimSpace(locale)
	return locale != "" && locale != "en"
}

// GetPosts returns a paginated list of posts, optionally filtered by type and/or tags.
// When locale asks for a non-English language, title and body are served via a
// COALESCE join on the translations table: translated_text wins when present,
// English source falls back when missing. machine_translated is true when at
// least one served field came from an unapproved AI translation.
//
// If tagIDs is non-empty, only gallery_album posts with any of those tags are returned (OR logic).
// If tagIDs is empty, the tag filter is ignored and all posts match (untagged albums still appear).
func (r *PostRepository) GetPosts(ctx context.Context, postType *model.PostType, tagIDs []string, limit, offset int, locale string) ([]model.Post, error) {
	localized := isLocalized(locale)
	args := []any{}
	argIdx := 1

	selectCols := `p.id, p.type, p.title, p.body, p.event_date, p.external_link, p.admin_id, p.created_at, p.updated_at, p.archived_at`
	if localized {
		// COALESCE: translated_text when the join hit, else English source.
		// The machine_translated flag is true when either join produced an
		// unapproved AI row. COALESCE(..., false) keeps the value boolean
		// (not NULL) when both joins missed.
		selectCols = `p.id, p.type,
		              COALESCE(t_title.translated_text, p.title) AS title,
		              COALESCE(t_body.translated_text,  p.body)  AS body,
		              p.event_date, p.external_link, p.admin_id, p.created_at, p.updated_at, p.archived_at,
		              COALESCE((t_title.id IS NOT NULL AND t_title.is_ai_generated AND t_title.approved_by IS NULL), false)
		              OR
		              COALESCE((t_body.id  IS NOT NULL AND t_body.is_ai_generated  AND t_body.approved_by  IS NULL), false)
		              AS machine_translated`
	}

	query := `SELECT DISTINCT ` + selectCols + `
	          FROM posts p`

	if localized {
		query += fmt.Sprintf(`
		 LEFT JOIN translations t_title
		   ON t_title.record_id = p.id AND t_title.field_name = 'title' AND t_title.locale = $%d
		 LEFT JOIN translations t_body
		   ON t_body.record_id  = p.id AND t_body.field_name  = 'body'  AND t_body.locale = $%d`,
			argIdx, argIdx+1)
		args = append(args, locale, locale)
		argIdx += 2
	}

	if len(tagIDs) > 0 {
		query += fmt.Sprintf(`
		 LEFT JOIN post_tags pt ON p.id = pt.post_id
		 WHERE p.type = $%d AND pt.tag_id = ANY($%d)`, argIdx, argIdx+1)
		args = append(args, model.PostTypeGalleryAlbum, tagIDs)
		argIdx += 2
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
		if localized {
			var machine bool
			if err := rows.Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt, &machine); err != nil {
				return nil, err
			}
			p.MachineTranslated = machine
		} else {
			if err := rows.Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt); err != nil {
				return nil, err
			}
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

// GetPostByID returns a single post by its ID. When locale is non-English,
// title and body are served from translations with English fallback.
func (r *PostRepository) GetPostByID(ctx context.Context, id, locale string) (*model.Post, error) {
	var p model.Post

	if !isLocalized(locale) {
		err := r.pool.QueryRow(ctx,
			`SELECT id, type, title, body, event_date, external_link, admin_id, created_at, updated_at, archived_at
			 FROM posts WHERE id = $1`, id,
		).Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, model.ErrNotFound
			}
			return nil, err
		}
		return &p, nil
	}

	var machine bool
	err := r.pool.QueryRow(ctx,
		`SELECT p.id, p.type,
		        COALESCE(t_title.translated_text, p.title) AS title,
		        COALESCE(t_body.translated_text,  p.body)  AS body,
		        p.event_date, p.external_link, p.admin_id, p.created_at, p.updated_at, p.archived_at,
		        COALESCE((t_title.id IS NOT NULL AND t_title.is_ai_generated AND t_title.approved_by IS NULL), false)
		        OR
		        COALESCE((t_body.id  IS NOT NULL AND t_body.is_ai_generated  AND t_body.approved_by  IS NULL), false)
		        AS machine_translated
		 FROM posts p
		 LEFT JOIN translations t_title
		   ON t_title.record_id = p.id AND t_title.field_name = 'title' AND t_title.locale = $2
		 LEFT JOIN translations t_body
		   ON t_body.record_id  = p.id AND t_body.field_name  = 'body'  AND t_body.locale = $2
		 WHERE p.id = $1`, id, locale,
	).Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt, &machine)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.ErrNotFound
		}
		return nil, err
	}
	p.MachineTranslated = machine
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
		 RETURNING id, type, title, body, event_date, external_link, admin_id, created_at, updated_at, archived_at`,
		req.Title, req.Body, req.EventDate, req.ExternalLink, id,
	).Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

// SetArchived flips a post's archived_at: now() when archiving (moving an event
// to the Past section) or NULL when un-archiving (back to Upcoming). Returns
// ErrNotFound if the post does not exist. Kept separate from UpdatePost because
// that path uses COALESCE to leave unspecified columns untouched and so cannot
// set a column back to NULL - which un-archiving requires.
func (r *PostRepository) SetArchived(ctx context.Context, id string, archived bool) (*model.Post, error) {
	var p model.Post
	err := r.pool.QueryRow(ctx,
		`UPDATE posts SET
			archived_at = CASE WHEN $2 THEN now() ELSE NULL END,
			updated_at = now()
		 WHERE id = $1
		 RETURNING id, type, title, body, event_date, external_link, admin_id, created_at, updated_at, archived_at`,
		id, archived,
	).Scan(&p.ID, &p.Type, &p.Title, &p.Body, &p.EventDate, &p.ExternalLink, &p.AdminID, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt)
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

// SetDiscordMessage records which Discord message a post was delivered as, and
// through which webhook (env key). Written by the best-effort delivery
// goroutine after a successful send, so a later edit/delete can target the same
// message. Kept off the read path: the public SELECTs never need these columns.
func (r *PostRepository) SetDiscordMessage(ctx context.Context, postID, messageID, channelKey string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE posts SET discord_message_id = $2, discord_channel_key = $3 WHERE id = $1`,
		postID, messageID, channelKey,
	)
	return err
}

// GetDiscordRef returns the stored Discord message id and channel key for a
// post. Both are nil when the post was never delivered to Discord (delivery is
// best-effort and may not have happened). Used by edit/delete to find the
// message to update or remove.
func (r *PostRepository) GetDiscordRef(ctx context.Context, postID string) (messageID, channelKey *string, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT discord_message_id, discord_channel_key FROM posts WHERE id = $1`,
		postID,
	).Scan(&messageID, &channelKey)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, model.ErrNotFound
		}
		return nil, nil, err
	}
	return messageID, channelKey, nil
}
