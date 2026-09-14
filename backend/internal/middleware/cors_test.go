package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORS_SetsConfiguredOriginAndMethods(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	handler := CORS("http://localhost:3000")(next)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("expected allow-origin header to be configured origin, got %q", got)
	}

	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("expected vary header to be Origin, got %q", got)
	}

	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatal("expected allow-methods header to be set")
	}
}

func TestCORS_EchoesMatchingOriginFromList(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := CORS("https://vgomne.org, https://www.vgomne.org/,https://church-website-neon.vercel.app")(next)

	cases := map[string]string{
		"https://vgomne.org":                     "https://vgomne.org",
		"https://www.vgomne.org":                 "https://www.vgomne.org",
		"https://church-website-neon.vercel.app": "https://church-website-neon.vercel.app",
		"https://evil.example":                   "https://vgomne.org", // unknown site: fall back to primary, browser blocks it
		"":                                       "https://vgomne.org", // no Origin header (curl, health checks)
	}

	for requestOrigin, want := range cases {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
		if requestOrigin != "" {
			req.Header.Set("Origin", requestOrigin)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != want {
			t.Errorf("Origin %q: allow-origin = %q, want %q", requestOrigin, got, want)
		}
	}
}

func TestCORS_EmptyConfigAllowsAll(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})
	handler := CORS("")(next)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected wildcard for empty config, got %q", got)
	}
}

func TestPrimaryOrigin(t *testing.T) {
	if got := PrimaryOrigin(" https://vgomne.org/ , https://www.vgomne.org"); got != "https://vgomne.org" {
		t.Fatalf("PrimaryOrigin = %q, want first trimmed entry", got)
	}
	if got := PrimaryOrigin(""); got != "" {
		t.Fatalf("PrimaryOrigin(\"\") = %q, want empty", got)
	}
}
