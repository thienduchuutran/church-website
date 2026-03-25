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
