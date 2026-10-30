package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

// Retention and clamping constants. 400 days of raw rows rather than 365 so a
// year-over-year chart always has both ends; the rest guard against a client
// with a wrong clock or a tab left open overnight.
const (
	analyticsRetention     = 400 * 24 * time.Hour
	analyticsMaxFuture     = 5 * time.Minute
	analyticsMaxPast       = 7 * 24 * time.Hour
	analyticsMaxDurationMs = 6 * 60 * 60 * 1000
	analyticsIngestLimit   = 60 // batches per minute per IP
)

// AnalyticsService owns everything between the public ingest endpoint and the
// analytics tables: privacy (hashing, bot and admin filtering), path
// normalisation, and the read-side aggregation the admin dashboard needs.
//
// The IP address enters Ingest and never leaves it. The repository only ever
// sees visitor_hash = sha256(secret || day || ip || user agent). Because the
// day is part of the hash, the same phone is one visitor within a day and a
// different, unlinkable string tomorrow - which is exactly enough to count
// daily uniques and not enough to follow anyone.
type AnalyticsService struct {
	repo    *repository.AnalyticsRepository
	limiter *IPRateLimiter
	secret  []byte
	loc     *time.Location
	now     func() time.Time
}

// NewAnalyticsService wires the service. loc is the congregation's time zone:
// every "day" in analytics_daily is a calendar day there, not in UTC, so the
// Sunday-morning spike lands on Sunday.
func NewAnalyticsService(repo *repository.AnalyticsRepository, secret string, loc *time.Location) *AnalyticsService {
	if loc == nil {
		loc = time.UTC
	}
	return &AnalyticsService{
		repo:    repo,
		limiter: NewIPRateLimiter(analyticsIngestLimit, time.Minute),
		secret:  []byte(secret),
		loc:     loc,
		now:     time.Now,
	}
}

// Allow is the per-IP rate check the handler runs before parsing the body.
func (s *AnalyticsService) Allow(ip string) bool {
	return s.limiter.Allow(ip)
}

// Ingest turns validated client events into rows. Admin batches and bot user
// agents are accepted and discarded: the client gets a 202 either way, so a
// bot learns nothing from the response and an admin's browser does not retry.
func (s *AnalyticsService) Ingest(ctx context.Context, ip, userAgent string, isAdmin bool, in []model.AnalyticsEventIn) error {
	if isAdmin || IsBotUserAgent(userAgent) || len(in) == 0 {
		return nil
	}
	now := s.now()
	device := ClassifyDevice(userAgent)
	rows := make([]model.AnalyticsEvent, 0, len(in))
	for _, e := range in {
		occurred := clampOccurredAt(e.OccurredAt, now)
		path, postID := NormalizePath(e.Path)

		props := make(map[string]any, len(e.Props)+1)
		for k, v := range e.Props {
			props[k] = v
		}
		if postID != "" {
			if _, ok := props["post_id"]; !ok {
				props["post_id"] = postID
			}
		}

		var duration *int
		if e.DurationMs != nil {
			d := *e.DurationMs
			if d < 0 {
				d = 0
			}
			if d > analyticsMaxDurationMs {
				d = analyticsMaxDurationMs
			}
			duration = &d
		}

		rows = append(rows, model.AnalyticsEvent{
			OccurredAt:   occurred,
			VisitorHash:  s.visitorHash(occurred, ip, userAgent),
			SessionID:    e.SessionID,
			Name:         e.Name,
			Path:         path,
			Locale:       e.Locale,
			ReferrerHost: referrerHost(e.Referrer),
			Device:       device,
			DurationMs:   duration,
			Returning:    e.Returning,
			Props:        props,
		})
	}
	return s.repo.InsertEvents(ctx, rows)
}

// visitorHash is the one place the IP is used. The day component is the
// calendar day in the site's time zone so a visitor is not split in two at
// UTC midnight (8pm in Saugus).
func (s *AnalyticsService) visitorHash(at time.Time, ip, userAgent string) string {
	day := at.In(s.loc).Format("2006-01-02")
	h := sha256.New()
	h.Write(s.secret)
	h.Write([]byte{0})
	h.Write([]byte(day))
	h.Write([]byte{0})
	h.Write([]byte(ip))
	h.Write([]byte{0})
	h.Write([]byte(userAgent))
	return hex.EncodeToString(h.Sum(nil))[:32]
}

// clampOccurredAt trusts the browser clock only within a window around now.
// A zero timestamp (older tracker, or a queued event with no clock) and
// anything outside the window both collapse to the server's now.
func clampOccurredAt(unixMs int64, now time.Time) time.Time {
	if unixMs <= 0 {
		return now
	}
	t := time.UnixMilli(unixMs)
	if t.After(now.Add(analyticsMaxFuture)) || t.Before(now.Add(-analyticsMaxPast)) {
		return now
	}
	return t
}

var uuidSegment = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// NormalizePath reduces a browser pathname to a route shape fit for a
// "top pages" table: query string and fragment dropped, the locale prefix
// removed (locale is its own column), UUID segments replaced by {id}, no
// trailing slash. The first UUID found is returned separately so the
// service can keep it as props.post_id.
func NormalizePath(raw string) (path string, firstID string) {
	p := raw
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p = p[:i]
	}
	segments := strings.Split(strings.Trim(p, "/"), "/")
	out := make([]string, 0, len(segments))
	for i, seg := range segments {
		if seg == "" {
			continue
		}
		if i == 0 && (seg == "en" || seg == "vi") {
			continue
		}
		if uuidSegment.MatchString(seg) {
			if firstID == "" {
				firstID = strings.ToLower(seg)
			}
			out = append(out, "{id}")
			continue
		}
		out = append(out, seg)
	}
	path = "/" + strings.Join(out, "/")
	if len(path) > 200 {
		path = path[:200]
	}
	return path, firstID
}

// referrerHost keeps only the host of an external referrer, minus "www.".
// The client already blanks same-site referrers, but a defensive parse here
// means a full URL never reaches the table even if a client misbehaves.
func referrerHost(ref string) *string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil
	}
	u, err := url.Parse(ref)
	if err != nil || u.Host == "" {
		return nil
	}
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	if host == "" {
		return nil
	}
	return &host
}

var botMarkers = []string{
	"bot", "crawl", "spider", "slurp", "headlesschrome", "phantomjs", "lighthouse",
	"pingdom", "uptimerobot", "facebookexternalhit", "preview", "curl/", "wget/",
	"python-requests", "go-http-client", "axios/", "node-fetch", "cron-job.org",
}

// IsBotUserAgent is a deliberately short denylist. The tracker only runs
// inside a real browser executing JavaScript, which already excludes most
// crawlers; this catches headless browsers and link-preview fetchers that do
// run scripts.
func IsBotUserAgent(ua string) bool {
	if strings.TrimSpace(ua) == "" {
		return true
	}
	l := strings.ToLower(ua)
	for _, m := range botMarkers {
		if strings.Contains(l, m) {
			return true
		}
	}
	return false
}

// ClassifyDevice buckets a user agent into phone / tablet / desktop. It is a
// coarse signal for a "which screen do people read on" chart, not device
// fingerprinting, so a handful of substrings is enough.
func ClassifyDevice(ua string) string {
	l := strings.ToLower(ua)
	switch {
	case strings.Contains(l, "ipad"), strings.Contains(l, "tablet"),
		strings.Contains(l, "android") && !strings.Contains(l, "mobile"):
		return "tablet"
	case strings.Contains(l, "mobile"), strings.Contains(l, "iphone"), strings.Contains(l, "android"):
		return "phone"
	default:
		return "desktop"
	}
}

// ---- Reads -----------------------------------------------------------------

// dayBounds converts an inclusive [from, to] pair of calendar dates into the
// UTC instants that bracket them in the site's time zone.
func (s *AnalyticsService) dayBounds(from, to time.Time) (time.Time, time.Time) {
	start := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, s.loc)
	end := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, s.loc).AddDate(0, 0, 1)
	return start.UTC(), end.UTC()
}

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// Overview computes the headline tiles for [from, to] and for the equally
// long period just before it.
func (s *AnalyticsService) Overview(ctx context.Context, from, to time.Time) (*model.AnalyticsOverview, error) {
	from, to = dateOnly(from), dateOnly(to)
	days := int(to.Sub(from).Hours()/24) + 1
	prevTo := from.AddDate(0, 0, -1)
	prevFrom := prevTo.AddDate(0, 0, -(days - 1))

	cur, err := s.totals(ctx, from, to, days)
	if err != nil {
		return nil, err
	}
	prev, err := s.totals(ctx, prevFrom, prevTo, days)
	if err != nil {
		return nil, err
	}
	return &model.AnalyticsOverview{
		From:     from.Format("2006-01-02"),
		To:       to.Format("2006-01-02"),
		Current:  *cur,
		Previous: *prev,
	}, nil
}

func (s *AnalyticsService) totals(ctx context.Context, from, to time.Time, days int) (*model.AnalyticsTotals, error) {
	visitors, err := s.repo.SumMetric(ctx, "visitors", "", from, to)
	if err != nil {
		return nil, fmt.Errorf("sum visitors: %w", err)
	}
	sessions, err := s.repo.SumMetric(ctx, "sessions", "", from, to)
	if err != nil {
		return nil, fmt.Errorf("sum sessions: %w", err)
	}
	viSessions, err := s.repo.SumMetric(ctx, "sessions_locale", "vi", from, to)
	if err != nil {
		return nil, fmt.Errorf("sum vi sessions: %w", err)
	}
	returning, err := s.repo.SumMetric(ctx, "returning_sessions", "", from, to)
	if err != nil {
		return nil, fmt.Errorf("sum returning: %w", err)
	}
	pageviews, err := s.repo.SumMetric(ctx, "pageviews", "", from, to)
	if err != nil {
		return nil, fmt.Errorf("sum pageviews: %w", err)
	}
	peakDay, peak, err := s.repo.PeakMetric(ctx, "visitors", "", from, to)
	if err != nil {
		return nil, fmt.Errorf("peak visitors: %w", err)
	}
	start, end := s.dayBounds(from, to)
	median, err := s.repo.MedianSessionSeconds(ctx, start, end)
	if err != nil {
		return nil, fmt.Errorf("median session: %w", err)
	}

	t := &model.AnalyticsTotals{
		Visitors:             int(visitors),
		PeakDailyVisitors:    int(peak),
		PeakDay:              peakDay,
		Sessions:             int(sessions),
		Pageviews:            int(pageviews),
		MedianSessionSeconds: median,
	}
	if days > 0 {
		t.AvgDailyVisitors = round1(visitors / float64(days))
	}
	if sessions > 0 {
		t.ReturnRate = round3(returning / sessions)
		t.ViShare = round3(viSessions / sessions)
		t.PagesPerSession = round1(pageviews / sessions)
	}
	return t, nil
}

func round1(v float64) float64 { return float64(int(v*10+0.5)) / 10 }
func round3(v float64) float64 { return float64(int(v*1000+0.5)) / 1000 }

// Timeseries returns one point per day, or per ISO week (Monday-start) when
// bucket is "week". Week buckets sum counts and average medians.
func (s *AnalyticsService) Timeseries(ctx context.Context, metric, dimension string, from, to time.Time, bucket string) ([]model.AnalyticsPoint, error) {
	from, to = dateOnly(from), dateOnly(to)
	daily, err := s.repo.Series(ctx, metric, dimension, from, to)
	if err != nil {
		return nil, err
	}
	byDay := make(map[string]float64, len(daily))
	for _, p := range daily {
		byDay[p.Day] = p.Value
	}
	// Fill gaps so a chart line does not skip quiet days.
	var points []model.AnalyticsPoint
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		points = append(points, model.AnalyticsPoint{Day: key, Value: byDay[key]})
	}
	if bucket != "week" {
		return points, nil
	}
	average := metric == "session_seconds_median"
	var weeks []model.AnalyticsPoint
	counts := map[string]int{}
	index := map[string]int{}
	for i, p := range points {
		d, _ := time.Parse("2006-01-02", p.Day)
		_ = i
		monday := d.AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
		key := monday.Format("2006-01-02")
		if _, ok := index[key]; !ok {
			index[key] = len(weeks)
			weeks = append(weeks, model.AnalyticsPoint{Day: key})
		}
		weeks[index[key]].Value += p.Value
		if p.Value > 0 {
			counts[key]++
		}
	}
	if average {
		for i := range weeks {
			if n := counts[weeks[i].Day]; n > 0 {
				weeks[i].Value = round1(weeks[i].Value / float64(n))
			}
		}
	}
	return weeks, nil
}

// breakdownMetric maps a public dimension name to the rollup metric that
// holds it. Keeping the mapping here means the table names never leak into
// the API.
var breakdownMetric = map[string]string{
	"path":     "pageviews_path",
	"locale":   "visitors_locale",
	"device":   "pageviews_device",
	"referrer": "pageviews_referrer",
	"event":    "events",
	"hour":     "pageviews_hour",
	"post":     "post_reads",
}

// Breakdown returns the top rows for a dimension with each row's share of the
// range total.
func (s *AnalyticsService) Breakdown(ctx context.Context, dimension string, from, to time.Time, limit int) ([]model.AnalyticsBreakdownRow, error) {
	metric, ok := breakdownMetric[dimension]
	if !ok {
		return nil, fmt.Errorf("unknown dimension %q", dimension)
	}
	from, to = dateOnly(from), dateOnly(to)
	rows, total, err := s.repo.Breakdown(ctx, metric, from, to, limit)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		if total > 0 {
			rows[i].Share = round3(rows[i].Value / total)
		}
	}
	return rows, nil
}

// Content lists posts with their reads in the range and all-time reactions.
func (s *AnalyticsService) Content(ctx context.Context, from, to time.Time) ([]model.ContentStat, error) {
	start, end := s.dayBounds(dateOnly(from), dateOnly(to))
	return s.repo.ContentStats(ctx, start, end)
}

// Pipeline measures translation quality and content velocity in the range.
func (s *AnalyticsService) Pipeline(ctx context.Context, from, to time.Time) (*model.PipelineStats, error) {
	start, end := s.dayBounds(dateOnly(from), dateOnly(to))
	return s.repo.PipelineStats(ctx, start, end)
}

// Requests aggregates the hourly route stats over the range.
func (s *AnalyticsService) Requests(ctx context.Context, from, to time.Time) ([]model.RouteStat, error) {
	start, end := s.dayBounds(dateOnly(from), dateOnly(to))
	return s.repo.RouteStats(ctx, start, end)
}

// ---- Maintenance (called by the rollup worker) -----------------------------

// RollupRecent rebuilds analytics_daily for today and yesterday in the site's
// time zone. Yesterday is included because beacons queued on a phone can
// arrive hours late, and rebuilding is idempotent so doing it every tick
// costs nothing but a small query.
func (s *AnalyticsService) RollupRecent(ctx context.Context) error {
	today := s.now().In(s.loc)
	for _, d := range []time.Time{today, today.AddDate(0, 0, -1)} {
		if err := s.RollupDay(ctx, d); err != nil {
			return err
		}
	}
	return nil
}

// RollupDay rebuilds one calendar day of analytics_daily.
func (s *AnalyticsService) RollupDay(ctx context.Context, day time.Time) error {
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, s.loc)
	start := day.UTC()
	end := day.AddDate(0, 0, 1).UTC()
	return s.repo.RollupDay(ctx, day.Format("2006-01-02"), start, end, s.loc.String())
}

// Prune deletes raw events past the retention window. The daily rollup keeps
// the numbers; only the ability to recompute them is given up.
func (s *AnalyticsService) Prune(ctx context.Context) (int64, error) {
	return s.repo.PruneBefore(ctx, s.now().Add(-analyticsRetention))
}

// FlushRequestStats persists completed hourly buckets from the logger.
func (s *AnalyticsService) FlushRequestStats(ctx context.Context, buckets []model.RequestBucket) error {
	if len(buckets) == 0 {
		return nil
	}
	return s.repo.UpsertRequestStats(ctx, buckets)
}
