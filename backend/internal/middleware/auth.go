package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// AdminChecker is satisfied by any type that can verify admin emails (e.g. AdminRepository).
type AdminChecker interface {
	AdminExists(ctx context.Context, email string) (bool, error)
}

// RequireAdmin verifies the Supabase JWT (ES256 signed) and checks the email against the admins whitelist.
// jwksCache should be pre-populated by calling FetchAndCacheKeys on startup.
func RequireAdmin(checker AdminChecker, jwksCache *JWKSCache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractBearerToken(r)

			if tokenStr == "" {
				http.Error(w, `{"error":"missing or malformed authorization header"}`, http.StatusUnauthorized)
				return
			}

			claims := jwt.MapClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (any, error) {
				if _, ok := token.Method.(*jwt.SigningMethodECDSA); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
																						
				kid, ok := token.Header["kid"].(string)
				if !ok {
					return nil, fmt.Errorf("token missing kid")
				}

				pubKey := jwksCache.GetKey(kid)
				if pubKey == nil {
					return nil, fmt.Errorf("key not found in cache: %s", kid)
				}

				return pubKey, nil
			})

			if err != nil {
				fmt.Printf("JWT parse error: %v\n", err)
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			if !token.Valid {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			if !token.Valid {
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
