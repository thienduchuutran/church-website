package middleware

import (
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// RequestStats collects per-route latency and status counts in memory so the
// analytics rollup worker can flush them to analytics_request_stats once an
// hour. It replaces the old passthrough RequestLogger placeholder.
//
// Buckets are keyed by (hour, chi route PATTERN, status class). The pattern
// (`/api/v1/posts/{id}`) rather than the URL is what bounds the map: a
// scanner requesting ten thousand random paths lands in one `404` bucket for
// the unmatched route, not ten thousand buckets.
//
// Each bucket keeps up to maxSamples raw durations for the percentile
// calculation and counts everything beyond that. At this site's traffic the
// cap is never reached; it exists so a traffic spike cannot grow memory
// without bound.
type RequestStats struct {
	mu      sync.Mutex
	buckets map[bucketKey]*bucket
	now     func() time.Time
	skip    map[string]bool
}

type bucketKey struct {
	hour        time.Time
	route       string
	statusClass string
}

type bucket struct {
	count   int
	samples []int // milliseconds
}

const maxSamples = 2000

// RequestBucket is one completed (hour, route, status class) row ready to be
// written to the database.
type RequestBucket struct {
	Hour        time.Time
	Route       string
	StatusClass string
	Count       int
	P50Ms       int
	P95Ms       int
}

// NewRequestStats builds a collector. Paths in skip are not recorded - the
// keep-warm pinger hits /api/v1/health every few minutes and would otherwise
// be the busiest route on the chart.
func NewRequestStats(skip ...string) *RequestStats {
	s := &RequestStats{
		buckets: make(map[bucketKey]*bucket),
		now:     time.Now,
		skip:    make(map[string]bool, len(skip)),
	}
	for _, p := range skip {
		s.skip[p] = true
	}
	return s
}

// statusRecorder captures the status code a handler writes. Handlers that
// never call WriteHeader implicitly send 200, hence the default.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(b)
}

// Middleware times each request and files it under its route pattern. It
// must be mounted on the router BEFORE routes are declared (router.Use), and
// it reads the pattern AFTER next returns because chi only resolves the
// pattern once a route has matched.
func (s *RequestStats) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// CORS preflights are answered by the CORS middleware before chi
		// routes anything, so they would all land in one "(unmatched)"
		// bucket. They are browser plumbing, not traffic.
		if s.skip[r.URL.Path] || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		start := s.now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		elapsed := s.now().Sub(start)

		route := "(unmatched)"
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			if p := rctx.RoutePattern(); p != "" {
				route = p
			}
		}
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		s.record(start, route, status, int(elapsed/time.Millisecond))
	})
}

func (s *RequestStats) record(at time.Time, route string, status int, ms int) {
	key := bucketKey{
		hour:        at.UTC().Truncate(time.Hour),
		route:       route,
		statusClass: statusClass(status),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	b := s.buckets[key]
	if b == nil {
		b = &bucket{}
		s.buckets[key] = b
	}
	b.count++
	if len(b.samples) < maxSamples {
		b.samples = append(b.samples, ms)
	}
}

// Snapshot removes and returns every bucket whose hour ended before `before`
// (pass time.Now() for completed hours only, or a far-future time on
// shutdown to flush everything). The current, still-filling hour stays in
// memory so its percentiles are computed over the full hour.
func (s *RequestStats) Snapshot(before time.Time) []RequestBucket {
	s.mu.Lock()
	defer s.mu.Unlock()

	var out []RequestBucket
	for key, b := range s.buckets {
		// A bucket is complete once its hour has fully elapsed.
		if key.hour.Add(time.Hour).After(before) {
			continue
		}
		p50, p95 := percentiles(b.samples)
		out = append(out, RequestBucket{
			Hour:        key.hour,
			Route:       key.route,
			StatusClass: key.statusClass,
			Count:       b.count,
			P50Ms:       p50,
			P95Ms:       p95,
		})
		delete(s.buckets, key)
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].Hour.Equal(out[j].Hour) {
			return out[i].Hour.Before(out[j].Hour)
		}
		if out[i].Route != out[j].Route {
			return out[i].Route < out[j].Route
		}
		return out[i].StatusClass < out[j].StatusClass
	})
	return out
}

func statusClass(status int) string {
	switch {
	case status >= 500:
		return "5xx"
	case status >= 400:
		return "4xx"
	case status >= 300:
		return "3xx"
	default:
		return "2xx"
	}
}

// percentiles returns the nearest-rank p50 and p95 of the samples.
func percentiles(samples []int) (int, int) {
	if len(samples) == 0 {
		return 0, 0
	}
	sorted := make([]int, len(samples))
	copy(sorted, samples)
	sort.Ints(sorted)
	rank := func(p float64) int {
		idx := int(float64(len(sorted))*p+0.5) - 1
		if idx < 0 {
			idx = 0
		}
		if idx >= len(sorted) {
			idx = len(sorted) - 1
		}
		return sorted[idx]
	}
	return rank(0.50), rank(0.95)
}

// RequestLogger is kept for callers that still reference the old placeholder
// name; it is a plain passthrough. New code should mount
// RequestStats.Middleware instead.
func RequestLogger(next http.Handler) http.Handler {
	return next
}
