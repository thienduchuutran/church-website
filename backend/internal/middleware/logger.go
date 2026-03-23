package middleware

import "net/http"

// RequestLogger is a passthrough middleware placeholder while custom logging is not yet implemented.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
	})
}
