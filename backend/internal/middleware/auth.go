package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// AdminChecker is satisfied by any type that can verify admin emails (e.g. AdminRepository).
type AdminChecker interface {
	AdminExists(ctx context.Context, email string) (bool, error)
}

// RequireAdmin verifies the Supabase JWT and checks the email against the admins whitelist.
func RequireAdmin(checker AdminChecker, jwtSecret string) func(http.Handler) http.Handler {
	secretBytes := []byte(jwtSecret)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractBearerToken(r)
			if tokenStr == "" {
				http.Error(w, `{"error":"missing or malformed authorization header"}`, http.StatusUnauthorized)
				return
			}

			claims := jwt.MapClaims{}
			_, err := jwt.ParseWithClaims(tokenStr, claims, func(_ *jwt.Token) (any, error) {
				return secretBytes, nil
			})
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			email, _ := claims["email"].(string)
			sub, _ := claims["sub"].(string)
			if email == "" {
				http.Error(w, `{"error":"token missing email claim"}`, http.StatusUnauthorized)
				return
			}

			exists, err := checker.AdminExists(r.Context(), email)
			if err != nil || !exists {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}

			ctx := context.WithValue(r.Context(), ctxAdminEmail, email)
			ctx = context.WithValue(ctx, ctxUserID, sub)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func extractBearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(header, "Bearer ")
}
