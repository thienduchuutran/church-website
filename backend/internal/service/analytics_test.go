package service

import (
	"testing"
	"time"
)

func TestNormalizePath(t *testing.T) {
	cases := []struct {
		in       string
		wantPath string
		wantID   string
	}{
		{"/", "/", ""},
		{"", "/", ""},
		{"/events", "/events", ""},
		{"/events/", "/events", ""},
		{"/vi/events?utm=x#top", "/events", ""},
		{"/en", "/", ""},
		{"/vi", "/", ""},
		{"/vi/events/6D2A1C3E-0000-4000-8000-000000000001", "/events/{id}", "6d2a1c3e-0000-4000-8000-000000000001"},
		{"/admin/pages/about", "/admin/pages/about", ""},
		// Only the first segment may be a locale prefix.
		{"/resources/vi", "/resources/vi", ""},
	}
	for _, c := range cases {
		gotPath, gotID := NormalizePath(c.in)
		if gotPath != c.wantPath || gotID != c.wantID {
			t.Errorf("NormalizePath(%q) = (%q, %q), want (%q, %q)", c.in, gotPath, gotID, c.wantPath, c.wantID)
		}
	}
}

func TestNormalizePath_CapsLength(t *testing.T) {
	long := "/" + string(make([]byte, 500))
	got, _ := NormalizePath(long)
	if len(got) > 200 {
		t.Fatalf("expected path capped at 200, got %d", len(got))
	}
}

func TestReferrerHost(t *testing.T) {
	if referrerHost("") != nil {
		t.Fatal("empty referrer should be nil")
	}
	if referrerHost("not a url") != nil {
		t.Fatal("garbage should be nil")
	}
	if h := referrerHost("https://www.Facebook.com/groups/123?x=1"); h == nil || *h != "facebook.com" {
		t.Fatalf("expected facebook.com, got %v", h)
	}
	if h := referrerHost("https://l.messenger.com/l.php?u=..."); h == nil || *h != "l.messenger.com" {
		t.Fatalf("expected l.messenger.com, got %v", h)
	}
}

func TestIsBotUserAgent(t *testing.T) {
	bots := []string{
		"",
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"Mozilla/5.0 HeadlessChrome/120.0",
		"facebookexternalhit/1.1",
		"curl/8.4.0",
		"Go-http-client/1.1",
	}
	for _, ua := range bots {
		if !IsBotUserAgent(ua) {
			t.Errorf("expected bot: %q", ua)
		}
	}
	humans := []string{
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
	}
	for _, ua := range humans {
		if IsBotUserAgent(ua) {
			t.Errorf("expected human: %q", ua)
		}
	}
}

func TestClassifyDevice(t *testing.T) {
	cases := map[string]string{
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari":    "phone",
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Mobile Safari":      "phone",
		"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit Safari":        "tablet",
		"Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit Safari":             "tablet",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome Safari":     "desktop",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit Version Safari": "desktop",
	}
	for ua, want := range cases {
		if got := ClassifyDevice(ua); got != want {
			t.Errorf("ClassifyDevice(%q) = %s, want %s", ua, got, want)
		}
	}
}

func TestClampOccurredAt(t *testing.T) {
	now := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	if got := clampOccurredAt(0, now); !got.Equal(now) {
		t.Fatal("zero timestamp should become now")
	}
	recent := now.Add(-2 * time.Hour)
	if got := clampOccurredAt(recent.UnixMilli(), now); !got.Equal(recent) {
		t.Fatal("a recent timestamp should be kept")
	}
	if got := clampOccurredAt(now.Add(time.Hour).UnixMilli(), now); !got.Equal(now) {
		t.Fatal("a future timestamp should become now")
	}
	if got := clampOccurredAt(now.AddDate(0, -1, 0).UnixMilli(), now); !got.Equal(now) {
		t.Fatal("a month-old timestamp should become now")
	}
}

func TestVisitorHash_RotatesDailyAndIsStableWithinADay(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	s := NewAnalyticsService(nil, "secret", loc, nil)

	// 11pm and 11:59pm Boston time are the same day there even though UTC
	// has already rolled over - the hash must not split the visitor.
	late := time.Date(2026, 10, 28, 23, 0, 0, 0, loc)
	later := time.Date(2026, 10, 28, 23, 59, 0, 0, loc)
	nextDay := time.Date(2026, 10, 29, 0, 1, 0, 0, loc)

	a := s.visitorHash(late, "1.2.3.4", "ua")
	b := s.visitorHash(later, "1.2.3.4", "ua")
	c := s.visitorHash(nextDay, "1.2.3.4", "ua")
	if a != b {
		t.Fatal("same visitor, same local day should hash identically")
	}
	if a == c {
		t.Fatal("hash must change on the next local day")
	}
	if s.visitorHash(late, "1.2.3.5", "ua") == a {
		t.Fatal("different IP must hash differently")
	}
	other := NewAnalyticsService(nil, "another-secret", loc, nil)
	if other.visitorHash(late, "1.2.3.4", "ua") == a {
		t.Fatal("different secret must hash differently")
	}
	if len(a) != 32 {
		t.Fatalf("expected a 32-char hash, got %d", len(a))
	}
}

func TestDayBounds_UsesSiteTimeZone(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	s := NewAnalyticsService(nil, "x", loc, nil)
	from := time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)
	start, end := s.dayBounds(from, from)
	// EDT is UTC-4 on this date: local midnight is 04:00Z.
	if start.Hour() != 4 || start.Day() != 28 {
		t.Fatalf("expected start 2026-10-28T04:00Z, got %s", start)
	}
	if end.Sub(start) != 24*time.Hour {
		t.Fatalf("expected a 24h window, got %s", end.Sub(start))
	}
}

func TestDecideAudience(t *testing.T) {
	s := NewAnalyticsService(nil, "x", time.UTC, []string{" Owner@Example.org ", ""})

	if aud, drop := s.decideAudience("", false); aud != "public" || drop {
		t.Fatalf("anonymous: want public/keep, got %s/%v", aud, drop)
	}
	if aud, drop := s.decideAudience("pastor@example.org", false); aud != "admin" || drop {
		t.Fatalf("verified admin: want admin/keep, got %s/%v", aud, drop)
	}
	if _, drop := s.decideAudience("owner@example.org", false); !drop {
		t.Fatal("excluded owner must be dropped, case-insensitively")
	}
	if _, drop := s.decideAudience("", true); !drop {
		t.Fatal("legacy is_admin with no token must still be dropped")
	}
	if aud, drop := s.decideAudience("pastor@example.org", true); aud != "admin" || drop {
		t.Fatal("a verified token wins over the legacy flag")
	}
}
