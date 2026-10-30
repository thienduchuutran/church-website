package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestRequestStats_BucketsByRoutePatternAndStatus(t *testing.T) {
	stats := NewRequestStats("/api/v1/health")
	clock := time.Date(2026, 10, 28, 10, 15, 0, 0, time.UTC)
	stats.now = func() time.Time { return clock }

	r := chi.NewRouter()
	r.Use(stats.Middleware)
	r.Get("/api/v1/posts/{id}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	r.Get("/api/v1/boom", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) })
	r.Get("/api/v1/health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	for _, p := range []string{"/api/v1/posts/a", "/api/v1/posts/b", "/api/v1/boom", "/api/v1/health", "/nope"} {
		req := httptest.NewRequest(http.MethodGet, p, nil)
		r.ServeHTTP(httptest.NewRecorder(), req)
	}

	// Nothing is complete yet: the hour is still filling.
	if got := stats.Snapshot(clock); len(got) != 0 {
		t.Fatalf("expected no completed buckets mid-hour, got %d", len(got))
	}

	got := stats.Snapshot(clock.Add(time.Hour))
	byKey := map[string]RequestBucket{}
	for _, b := range got {
		byKey[b.Route+"|"+b.StatusClass] = b
	}
	if b := byKey["/api/v1/posts/{id}|2xx"]; b.Count != 2 {
		t.Fatalf("expected 2 hits on the posts pattern, got %+v", byKey)
	}
	if b := byKey["/api/v1/boom|5xx"]; b.Count != 1 {
		t.Fatalf("expected the 500 filed under 5xx, got %+v", byKey)
	}
	if _, ok := byKey["/api/v1/health|2xx"]; ok {
		t.Fatal("health pings must be skipped")
	}
	if b, ok := byKey["(unmatched)|4xx"]; !ok || b.Count != 1 {
		t.Fatalf("expected the unmatched path in one 4xx bucket, got %+v", byKey)
	}
	// Snapshot drains.
	if again := stats.Snapshot(clock.Add(time.Hour)); len(again) != 0 {
		t.Fatalf("second snapshot should be empty, got %d", len(again))
	}
}

func TestRequestStats_ImplicitStatusIsOK(t *testing.T) {
	stats := NewRequestStats()
	r := chi.NewRouter()
	r.Use(stats.Middleware)
	// Handler writes a body without calling WriteHeader.
	r.Get("/x", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("hi")) })
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil))

	got := stats.Snapshot(time.Now().Add(2 * time.Hour))
	if len(got) != 1 || got[0].StatusClass != "2xx" {
		t.Fatalf("expected one 2xx bucket, got %+v", got)
	}
}

func TestPercentiles(t *testing.T) {
	p50, p95 := percentiles(nil)
	if p50 != 0 || p95 != 0 {
		t.Fatal("empty samples must yield zeros")
	}
	samples := make([]int, 0, 100)
	for i := 1; i <= 100; i++ {
		samples = append(samples, i)
	}
	p50, p95 = percentiles(samples)
	if p50 != 50 || p95 != 95 {
		t.Fatalf("expected 50/95, got %d/%d", p50, p95)
	}
}

func TestStatusClass(t *testing.T) {
	cases := map[int]string{200: "2xx", 204: "2xx", 303: "3xx", 404: "4xx", 429: "4xx", 500: "5xx", 503: "5xx"}
	for code, want := range cases {
		if got := statusClass(code); got != want {
			t.Fatalf("%d: want %s got %s", code, want, got)
		}
	}
}
