package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

type AdminRepository struct {
	pool *pgxpool.Pool
}

func NewAdminRepository(pool *pgxpool.Pool) *AdminRepository {
	return &AdminRepository{pool: pool}
}

// AdminExists checks whether the given email is in the admins whitelist.
func (r *AdminRepository) AdminExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM admins WHERE email = $1)`,
		email,
	).Scan(&exists)
	return exists, err
}

// GetByEmail returns the full admin row, including the linked Discord identity
// (nullable). Used at post time to decide which name/avatar the Discord message
// is sent under. Returns model.ErrNotFound when no such admin exists.
func (r *AdminRepository) GetByEmail(ctx context.Context, email string) (*model.Admin, error) {
	var a model.Admin
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, display_name, discord_user_id, discord_username, discord_avatar_url, created_at
		 FROM admins WHERE email = $1`,
		email,
	).Scan(&a.ID, &a.Email, &a.DisplayName, &a.DiscordUserID, &a.DiscordUsername, &a.DiscordAvatarURL, &a.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}

// SetDiscordIdentity records the Discord account an admin linked via OAuth.
// Called from the OAuth callback. Returns model.ErrNotFound if the email is no
// longer in the admins table (e.g. access was revoked mid-flow).
func (r *AdminRepository) SetDiscordIdentity(ctx context.Context, email, userID, username, avatarURL string) error {
	ct, err := r.pool.Exec(ctx,
		`UPDATE admins
		    SET discord_user_id = $2, discord_username = $3, discord_avatar_url = $4
		  WHERE email = $1`,
		email, userID, username, avatarURL,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return model.ErrNotFound
	}
	return nil
}
