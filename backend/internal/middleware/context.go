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

// WithUserID returns a new context with the user ID set.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ctxUserID, userID)
}

// WithAdminEmail returns a new context with the admin email set.
func WithAdminEmail(ctx context.Context, email string) context.Context {
	return context.WithValue(ctx, ctxAdminEmail, email)
}

