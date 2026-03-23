package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
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
