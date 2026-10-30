package service

import (
	"sync"
	"time"
)

// IPRateLimiter is a sliding-window, per-key request limiter kept in memory.
//
// It used to live inline in AssistantService. The analytics ingest endpoint
// needed the same thing, and two private copies of a limiter are two places
// to get the pruning wrong, so it is one type with one test and two
// instances (assistant: 10/min, analytics: 60/min).
//
// In-memory is the right scope here: Render runs one container, and even
// under horizontal scaling a per-instance limit is still a limit. The map
// is pruned on every call for the key being checked and, every sweepEvery
// calls, for all keys, so a scanner cycling through addresses cannot grow
// it without bound.
type IPRateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
	calls  int
	now    func() time.Time
}

const sweepEvery = 1000

// NewIPRateLimiter allows `limit` calls per `window` for each key.
func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	return &IPRateLimiter{
		hits:   make(map[string][]time.Time),
		limit:  limit,
		window: window,
		now:    time.Now,
	}
}

// Allow records a hit for key and reports whether it was within the limit.
// A rejected call is not recorded, so a client that keeps hammering does
// not push its own window further into the future.
func (l *IPRateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	cutoff := now.Add(-l.window)

	l.calls++
	if l.calls%sweepEvery == 0 {
		l.sweepLocked(cutoff)
	}

	valid := pruneBefore(l.hits[key], cutoff)
	if len(valid) >= l.limit {
		l.hits[key] = valid
		return false
	}
	l.hits[key] = append(valid, now)
	return true
}

// sweepLocked drops every key whose hits have all expired. Caller holds mu.
func (l *IPRateLimiter) sweepLocked(cutoff time.Time) {
	for k, ts := range l.hits {
		if kept := pruneBefore(ts, cutoff); len(kept) == 0 {
			delete(l.hits, k)
		} else {
			l.hits[k] = kept
		}
	}
}

// pruneBefore keeps only timestamps after cutoff, reusing the backing array.
func pruneBefore(ts []time.Time, cutoff time.Time) []time.Time {
	kept := ts[:0]
	for _, t := range ts {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	return kept
}
