package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// Limits on the public ingest endpoint. Together with the per-IP limiter they
// are the whole security boundary of the one anonymous write this feature
// adds, which is why each is a named constant the tests reference.
const (
	maxEventsPerBatch  = 20
	maxIngestBodyBytes = 16 << 10
	maxPathLen         = 300
	maxPropKeys        = 8
	maxPropValueLen    = 120
	maxBreakdownLimit  = 50
	maxRangeDays       = 400
	defaultRangeDays   = 30
)

// analyticsService is the interface the handler depends on so tests can swap
// in mockAnalyticsService without a database.
type analyticsService interface {
	Allow(ip string) bool
	// adminEmail is whatever middleware.OptionalAdmin verified ("" when
	// anonymous); legacyIsAdmin is the old client-asserted body flag.
	Ingest(ctx context.Context, ip, userAgent, adminEmail string, legacyIsAdmin bool, events []model.AnalyticsEventIn) error
	Overview(ctx context.Context, audience string, from, to time.Time) (*model.AnalyticsOverview, error)
	Timeseries(ctx context.Context, audience, metric, dimension string, from, to time.Time, bucket string) ([]model.AnalyticsPoint, error)
	Breakdown(ctx context.Context, audience, dimension string, from, to time.Time, limit int) ([]model.AnalyticsBreakdownRow, error)
	Content(ctx context.Context, audience string, from, to time.Time) ([]model.ContentStat, error)
	Pipeline(ctx context.Context, from, to time.Time) (*model.PipelineStats, error)
	Requests(ctx context.Context, from, to time.Time) ([]model.RouteStat, error)
}

// AnalyticsHandler serves the public ingest endpoint and the admin-only reads.
type AnalyticsHandler struct {
	svc analyticsService
}

func NewAnalyticsHandler(svc analyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{svc: svc}
}

var (
	allowedLocales   = map[string]bool{"en": true, "vi": true}
	allowedMetrics   = map[string]bool{"visitors": true, "sessions": true, "pageviews": true, "returning_sessions": true, "events": true, "session_seconds_median": true, "post_reads": true, "visitors_locale": true, "sessions_locale": true}
	allowedBuckets   = map[string]bool{"day": true, "week": true}
	allowedBreakdown = map[string]bool{"path": true, "locale": true, "device": true, "referrer": true, "event": true, "hour": true, "post": true}
	allowedAudiences = map[string]bool{model.AudiencePublic: true, model.AudienceAdmin: true, model.AudienceAll: true}
)

// clientIP strips the port from RemoteAddr. chi's RealIP middleware has
// already replaced RemoteAddr with the X-Forwarded-For address on Render.
func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// Ingest handles POST /api/v1/analytics/events. Public on purpose: a visitor
// is anonymous. Order matters - the rate check runs before the body is read
// so a flood costs one map lookup, and the size cap is enforced by the
// reader so an oversized body is never buffered.
//
// Who sent the batch comes from the request context, where
// middleware.OptionalAdmin put a verified admin email (or nothing). The body
// never gets to say who it is from.
func (h *AnalyticsHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !h.svc.Allow(ip) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxIngestBodyBytes)
	var batch model.AnalyticsBatch
	if err := json.NewDecoder(r.Body).Decode(&batch); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "batch too large")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(batch.Events) == 0 {
		writeError(w, http.StatusBadRequest, "events is required")
		return
	}
	if len(batch.Events) > maxEventsPerBatch {
		writeError(w, http.StatusBadRequest, "too many events in one batch")
		return
	}
	for i := range batch.Events {
		if msg := validateEvent(&batch.Events[i]); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
	}

	adminEmail := middleware.AdminEmailFromContext(r.Context())
	if err := h.svc.Ingest(r.Context(), ip, r.UserAgent(), adminEmail, batch.IsAdmin, batch.Events); err != nil {
		log.Printf("analytics ingest: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to record events")
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// validateEvent returns an empty string when the event is acceptable, else
// the 400 message. Every check here is about keeping arbitrary client
// strings out of the tables, not about business rules.
func validateEvent(e *model.AnalyticsEventIn) string {
	if !model.AnalyticsEventNames[e.Name] {
		return "unknown event name"
	}
	if e.Path == "" || !strings.HasPrefix(e.Path, "/") || len(e.Path) > maxPathLen {
		return "path must be a relative path"
	}
	if !allowedLocales[e.Locale] {
		return "unsupported locale"
	}
	if n := len(e.SessionID); n < 8 || n > 64 {
		return "session_id must be 8-64 characters"
	}
	if len(e.Referrer) > 2048 {
		return "referrer too long"
	}
	if len(e.Props) > maxPropKeys {
		return "too many props"
	}
	for k, v := range e.Props {
		if !model.AnalyticsPropKeys[k] {
			return "unknown prop key: " + k
		}
		switch val := v.(type) {
		case string:
			if len(val) > maxPropValueLen {
				return "prop value too long: " + k
			}
		case float64, bool:
		default:
			return "prop value must be a string, number or boolean: " + k
		}
	}
	return ""
}

// parseRange reads ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). Missing `to`
// is today; missing `from` is 30 days back. The span is capped at the raw
// retention window so a typo cannot ask for a decade of rows.
func parseRange(r *http.Request) (time.Time, time.Time, string) {
	today := time.Now().UTC().Truncate(24 * time.Hour)
	to := today
	from := today.AddDate(0, 0, -(defaultRangeDays - 1))
	q := r.URL.Query()
	if s := q.Get("to"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return from, to, "to must be YYYY-MM-DD"
		}
		to = t
		from = to.AddDate(0, 0, -(defaultRangeDays - 1))
	}
	if s := q.Get("from"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return from, to, "from must be YYYY-MM-DD"
		}
		from = t
	}
	if from.After(to) {
		return from, to, "from must not be after to"
	}
	if to.Sub(from) > time.Duration(maxRangeDays)*24*time.Hour {
		return from, to, "range too long"
	}
	return from, to, ""
}

// parseAudience reads ?audience=public|admin|all. Public is the default
// because the dashboard's default view is the leadership-facing one.
func parseAudience(r *http.Request) (string, string) {
	a := r.URL.Query().Get("audience")
	if a == "" {
		return model.AudiencePublic, ""
	}
	if !allowedAudiences[a] {
		return "", "audience must be public, admin or all"
	}
	return a, ""
}

// Overview handles GET /api/v1/admin/analytics/overview.
func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	audience, msg := parseAudience(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	from, to, msg := parseRange(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	out, err := h.svc.Overview(r.Context(), audience, from, to)
	if err != nil {
		log.Printf("analytics overview: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load overview")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// Timeseries handles GET /api/v1/admin/analytics/timeseries?metric=&dimension=&bucket=day|week.
func (h *AnalyticsHandler) Timeseries(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	metric := q.Get("metric")
	if !allowedMetrics[metric] {
		writeError(w, http.StatusBadRequest, "unknown metric")
		return
	}
	bucket := q.Get("bucket")
	if bucket == "" {
		bucket = "day"
	}
	if !allowedBuckets[bucket] {
		writeError(w, http.StatusBadRequest, "bucket must be day or week")
		return
	}
	dimension := q.Get("dimension")
	if len(dimension) > 200 {
		writeError(w, http.StatusBadRequest, "dimension too long")
		return
	}
	audience, msg := parseAudience(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	from, to, msg := parseRange(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	points, err := h.svc.Timeseries(r.Context(), audience, metric, dimension, from, to, bucket)
	if err != nil {
		log.Printf("analytics timeseries: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load series")
		return
	}
	if points == nil {
		points = []model.AnalyticsPoint{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"metric":    metric,
		"dimension": dimension,
		"bucket":    bucket,
		"audience":  audience,
		"from":      from.Format("2006-01-02"),
		"to":        to.Format("2006-01-02"),
		"points":    points,
	})
}

// Breakdown handles GET /api/v1/admin/analytics/breakdown?dimension=path|locale|device|referrer|event|hour|post&limit=.
func (h *AnalyticsHandler) Breakdown(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	dimension := q.Get("dimension")
	if !allowedBreakdown[dimension] {
		writeError(w, http.StatusBadRequest, "unknown dimension")
		return
	}
	limit := 10
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 {
			writeError(w, http.StatusBadRequest, "limit must be a positive integer")
			return
		}
		limit = n
	}
	if limit > maxBreakdownLimit {
		limit = maxBreakdownLimit
	}
	audience, msg := parseAudience(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	from, to, msg := parseRange(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	rows, err := h.svc.Breakdown(r.Context(), audience, dimension, from, to, limit)
	if err != nil {
		log.Printf("analytics breakdown: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load breakdown")
		return
	}
	if rows == nil {
		rows = []model.AnalyticsBreakdownRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"dimension": dimension,
		"audience":  audience,
		"from":      from.Format("2006-01-02"),
		"to":        to.Format("2006-01-02"),
		"rows":      rows,
	})
}

// Content handles GET /api/v1/admin/analytics/content.
func (h *AnalyticsHandler) Content(w http.ResponseWriter, r *http.Request) {
	audience, msg := parseAudience(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	from, to, msg := parseRange(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	items, err := h.svc.Content(r.Context(), audience, from, to)
	if err != nil {
		log.Printf("analytics content: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load content stats")
		return
	}
	if items == nil {
		items = []model.ContentStat{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"audience": audience,
		"from":     from.Format("2006-01-02"),
		"to":       to.Format("2006-01-02"),
		"items":    items,
	})
}

// Pipeline handles GET /api/v1/admin/analytics/pipeline. No audience: it
// reads the content tables, not visitor events.
func (h *AnalyticsHandler) Pipeline(w http.ResponseWriter, r *http.Request) {
	from, to, msg := parseRange(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	out, err := h.svc.Pipeline(r.Context(), from, to)
	if err != nil {
		log.Printf("analytics pipeline: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load pipeline stats")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// Requests handles GET /api/v1/admin/analytics/requests. No audience:
// backend traffic is not per-visitor.
func (h *AnalyticsHandler) Requests(w http.ResponseWriter, r *http.Request) {
	from, to, msg := parseRange(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	routes, err := h.svc.Requests(r.Context(), from, to)
	if err != nil {
		log.Printf("analytics requests: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load request stats")
		return
	}
	if routes == nil {
		routes = []model.RouteStat{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from":   from.Format("2006-01-02"),
		"to":     to.Format("2006-01-02"),
		"routes": routes,
	})
}
