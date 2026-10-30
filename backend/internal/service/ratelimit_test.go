package service

import (
	"testing"
	"time"
)

func newTestLimiter(limit int, window time.Duration) (*IPRateLimiter, *time.Time) {
	l := NewIPRateLimiter(limit, window)
	clock := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return clock }
	return l, &clock
}

func TestIPRateLimiter_AllowsUpToLimitThenBlocks(t *testing.T) {
	l, _ := newTestLimiter(3, time.Minute)
	for i := 0; i < 3; i++ {
		if !l.Allow("1.2.3.4") {
			t.Fatalf("call %d should be allowed", i+1)
		}
	}
	if l.Allow("1.2.3.4") {
		t.Fatal("4th call within the window should be blocked")
	}
}

func TestIPRateLimiter_KeysAreIndependent(t *testing.T) {
	l, _ := newTestLimiter(1, time.Minute)
	if !l.Allow("a") {
		t.Fatal("first call for a should pass")
	}
	if !l.Allow("b") {
		t.Fatal("first call for b should pass even though a is exhausted")
	}
}

func TestIPRateLimiter_WindowSlides(t *testing.T) {
	l, clock := newTestLimiter(2, time.Minute)
	l.Allow("k")
	l.Allow("k")
	if l.Allow("k") {
		t.Fatal("should be blocked at the limit")
	}
	*clock = clock.Add(61 * time.Second)
	if !l.Allow("k") {
		t.Fatal("should be allowed again once the window has passed")
	}
}

func TestIPRateLimiter_RejectedCallsDoNotExtendTheWindow(t *testing.T) {
	l, clock := newTestLimiter(1, time.Minute)
	l.Allow("k")
	*clock = clock.Add(59 * time.Second)
	l.Allow("k") // rejected; must not be recorded
	*clock = clock.Add(2 * time.Second)
	if !l.Allow("k") {
		t.Fatal("the rejected call at t+59s must not have reset the window")
	}
}

func TestIPRateLimiter_SweepDropsExpiredKeys(t *testing.T) {
	l, clock := newTestLimiter(10, time.Minute)
	l.Allow("old")
	*clock = clock.Add(2 * time.Minute)
	// Force a sweep by crossing the sweepEvery boundary.
	for i := 0; i < sweepEvery; i++ {
		l.Allow("fresh")
	}
	if _, ok := l.hits["old"]; ok {
		t.Fatal("expired key should have been swept from the map")
	}
}
