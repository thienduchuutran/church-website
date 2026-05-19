package middleware

import "context"

type contextKey string

const (
	ctxAdminEmail contextKey = "admin_email"
	ctxUserID     contextKey = "user_id"
)

// AdminEmailFromContext returns the admin email set by RequireAdmin middleware.
func AdminEmailFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxAdminEmail).(string); ok {
		return v
	}
	return ""
}

// UserIDFromContext returns the Supabase user UUID set by RequireAdmin middleware.
func UserIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxUserID).(string); ok {
		return v
	}
	return ""
}

// WithUserID returns a derived context carrying the given user ID. Exposed so
// handler tests can exercise authenticated paths without standing up the full
// RequireAdmin middleware chain (JWKS fetch, JWT verify, admins lookup).
func WithUserID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxUserID, id)
}
