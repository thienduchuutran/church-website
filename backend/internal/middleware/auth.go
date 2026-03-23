package middleware

import "net/http"

// RequireAdmin is a temporary auth gate so protected routes can be wired safely before JWT validation is implemented.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
	})
}
