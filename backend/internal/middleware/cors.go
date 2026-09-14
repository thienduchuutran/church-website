package middleware

import (
	"net/http"
	"strings"
)

// ParseOrigins splits the FRONTEND_ORIGIN env value into a clean list.
// The value may be a single origin ("https://vgomne.org") or several joined
// by commas ("https://vgomne.org,https://www.vgomne.org"). Blank entries and
// surrounding whitespace are dropped, and a trailing slash is stripped so the
// entry matches the browser's Origin header byte-for-byte.
func ParseOrigins(raw string) []string {
	var origins []string
	for _, part := range strings.Split(raw, ",") {
		origin := strings.TrimRight(strings.TrimSpace(part), "/")
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

// PrimaryOrigin returns the first configured origin, or "" when none is set.
// Callers that need exactly one base URL (e.g. an OAuth redirect target) use
// this instead of the raw env value, which may be a list.
func PrimaryOrigin(raw string) string {
	origins := ParseOrigins(raw)
	if len(origins) == 0 {
		return ""
	}
	return origins[0]
}

// CORS allows frontend browser clients to call the API from an approved origin.
//
// frontendOrigin is the raw FRONTEND_ORIGIN value and may list several origins
// separated by commas. Browsers only accept a single value in
// Access-Control-Allow-Origin, so the middleware echoes back whichever
// configured origin matches the request's Origin header. When nothing matches
// (or the request carries no Origin header) it falls back to the first
// configured origin, which the browser then rejects on its own - the API never
// approves an unknown site. An empty value allows every origin ("*").
func CORS(frontendOrigin string) func(http.Handler) http.Handler {
	allowed := ParseOrigins(frontendOrigin)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", resolveOrigin(allowed, r.Header.Get("Origin")))
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// resolveOrigin picks the Access-Control-Allow-Origin value for one request.
func resolveOrigin(allowed []string, requestOrigin string) string {
	if len(allowed) == 0 {
		return "*"
	}
	for _, origin := range allowed {
		if strings.EqualFold(origin, requestOrigin) {
			return origin
		}
	}
	return allowed[0]
}
