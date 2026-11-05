package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// mockAnalyticsService records what the handler hands it so tests can assert
// on validation without a database or a real rate limiter.
type mockAnalyticsService struct {
	limited   bool
	ingestErr error
	gotEvents []model.AnalyticsEventIn
	gotEmail  string
	gotLegacy bool
	gotIP     string
	ingested  bool

	overview    *model.AnalyticsOverview
	points      []model.AnalyticsPoint
	rows        []model.AnalyticsBreakdownRow
	content     []model.ContentStat
	pipeline    *model.PipelineStats
	routes      []model.RouteStat
	readErr     error
	gotAudience string
	gotFrom     time.Time
	gotTo       time.Time
	gotMetric   string
	gotDim      string
	gotBucket   string
	gotLimit    int
}

func (m *mockAnalyticsService) Allow(_ string) bool { return !m.limited }
func (m *mockAnalyticsService) Ingest(_ context.Context, ip, _ string, adminEmail string, legacyIsAdmin bool, events []model.AnalyticsEventIn) error {
	m.ingested = true
	m.gotIP = ip
	m.gotEmail = adminEmail
	m.gotLegacy = legacyIsAdmin
	m.gotEvents = events
	return m.ingestErr
}
func (m *mockAnalyticsService) Overview(_ context.Context, audience string, from, to time.Time) (*model.AnalyticsOverview, error) {
	m.gotAudience, m.gotFrom, m.gotTo = audience, from, to
	return m.overview, m.readErr
}
func (m *mockAnalyticsService) Timeseries(_ context.Context, audience, metric, dimension string, from, to time.Time, bucket string) ([]model.AnalyticsPoint, error) {
	m.gotAudience, m.gotMetric, m.gotDim, m.gotFrom, m.gotTo, m.gotBucket = audience, metric, dimension, from, to, bucket
	return m.points, m.readErr
}
func (m *mockAnalyticsService) Breakdown(_ context.Context, audience, dimension string, from, to time.Time, limit int) ([]model.AnalyticsBreakdownRow, error) {
	m.gotAudience, m.gotDim, m.gotFrom, m.gotTo, m.gotLimit = audience, dimension, from, to, limit
	return m.rows, m.readErr
}
func (m *mockAnalyticsService) Content(_ context.Context, audience string, from, to time.Time) ([]model.ContentStat, error) {
	m.gotAudience, m.gotFrom, m.gotTo = audience, from, to
	return m.content, m.readErr
}
func (m *mockAnalyticsService) Pipeline(_ context.Context, from, to time.Time) (*model.PipelineStats, error) {
	m.gotFrom, m.gotTo = from, to
	return m.pipeline, m.readErr
}
func (m *mockAnalyticsService) Requests(_ context.Context, from, to time.Time) ([]model.RouteStat, error) {
	m.gotFrom, m.gotTo = from, to
	return m.routes, m.readErr
}

func validBatch() string {
	return `{"events":[{"name":"page_view","path":"/events","locale":"vi","session_id":"sess-12345678","occurred_at":1760000000000,"returning":true}]}`
}

func postEvents(h *AnalyticsHandler, body string) *httptest.ResponseRecorder {
	return postEventsAs(h, body, "")
}

// postEventsAs simulates what middleware.OptionalAdmin does when the bearer
// token verified and the email is an admin: the email lands on the context.
func postEventsAs(h *AnalyticsHandler, body, adminEmail string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/analytics/events", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (iPhone)")
	req.RemoteAddr = "203.0.113.9:51234"
	if adminEmail != "" {
		req = req.WithContext(middleware.WithAdminEmail(req.Context(), adminEmail))
	}
	rec := httptest.NewRecorder()
	h.Ingest(rec, req)
	return rec
}

// ---- POST /analytics/events -------------------------------------------------

func TestAnalyticsHandler_Ingest_success(t *testing.T) {
	svc := &mockAnalyticsService{}
	h := NewAnalyticsHandler(svc)

	rec := postEvents(h, validBatch())

	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d body=%s", rec.Code, rec.Body)
	}
	if len(svc.gotEvents) != 1 || svc.gotEvents[0].Name != "page_view" {
		t.Fatalf("service did not receive the event: %+v", svc.gotEvents)
	}
	if svc.gotIP != "203.0.113.9" {
		t.Fatalf("expected port stripped from IP, got %q", svc.gotIP)
	}
	if !svc.gotEvents[0].Returning {
		t.Fatal("returning flag was dropped")
	}
	if svc.gotEmail != "" {
		t.Fatalf("anonymous request must carry no admin email, got %q", svc.gotEmail)
	}
}

func TestAnalyticsHandler_Ingest_adminEmailComesFromContextNotBody(t *testing.T) {
	svc := &mockAnalyticsService{}
	h := NewAnalyticsHandler(svc)

	rec := postEventsAs(h, validBatch(), "pastor@example.org")

	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d body=%s", rec.Code, rec.Body)
	}
	if svc.gotEmail != "pastor@example.org" {
		t.Fatalf("expected the verified email forwarded, got %q", svc.gotEmail)
	}
}

func TestAnalyticsHandler_Ingest_legacyAdminFlagStillForwarded(t *testing.T) {
	svc := &mockAnalyticsService{}
	h := NewAnalyticsHandler(svc)
	body := strings.Replace(validBatch(), `{"events"`, `{"is_admin":true,"events"`, 1)

	rec := postEvents(h, body)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d body=%s", rec.Code, rec.Body)
	}
	if !svc.gotLegacy {
		t.Fatal("legacy is_admin flag was not forwarded to the service")
	}
}

func TestAnalyticsHandler_Ingest_invalidJSON(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	rec := postEvents(h, `{"events":[`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_emptyBatch(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	rec := postEvents(h, `{"events":[]}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty batch, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_tooManyEvents(t *testing.T) {
	svc := &mockAnalyticsService{}
	h := NewAnalyticsHandler(svc)
	one := `{"name":"page_view","path":"/","locale":"en","session_id":"sess-12345678","occurred_at":1760000000000}`
	events := make([]string, 0, maxEventsPerBatch+1)
	for i := 0; i <= maxEventsPerBatch; i++ {
		events = append(events, one)
	}
	body := `{"events":[` + strings.Join(events, ",") + `]}`

	rec := postEvents(h, body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for %d events, got %d", maxEventsPerBatch+1, rec.Code)
	}
	if svc.ingested {
		t.Fatal("service must not be called when the batch is rejected")
	}
}

func TestAnalyticsHandler_Ingest_unknownEventName(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	body := strings.Replace(validBatch(), `"page_view"`, `"drop_table"`, 1)
	rec := postEvents(h, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown event name, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_badLocale(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	body := strings.Replace(validBatch(), `"locale":"vi"`, `"locale":"xx"`, 1)
	rec := postEvents(h, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unsupported locale, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_pathMustBeRelative(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	body := strings.Replace(validBatch(), `"path":"/events"`, `"path":"https://evil.example/x"`, 1)
	rec := postEvents(h, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for absolute path, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_shortSessionID(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	body := strings.Replace(validBatch(), `"session_id":"sess-12345678"`, `"session_id":"abc"`, 1)
	rec := postEvents(h, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for short session id, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_unknownPropKey(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	body := strings.Replace(validBatch(), `"returning":true`, `"returning":true,"props":{"email":"a@b.c"}`, 1)
	rec := postEvents(h, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-whitelisted prop key, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_allowsWhitelistedProps(t *testing.T) {
	svc := &mockAnalyticsService{}
	h := NewAnalyticsHandler(svc)
	body := strings.Replace(validBatch(), `"returning":true`, `"returning":true,"props":{"post_id":"6d2a1c3e-0000-4000-8000-000000000001"}`, 1)
	rec := postEvents(h, body)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d body=%s", rec.Code, rec.Body)
	}
	if svc.gotEvents[0].Props["post_id"] == nil {
		t.Fatal("whitelisted prop was dropped")
	}
}

func TestAnalyticsHandler_Ingest_bodyTooLarge(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	big := strings.Repeat("a", maxIngestBodyBytes+1)
	body := strings.Replace(validBatch(), `"path":"/events"`, `"path":"/`+big+`"`, 1)
	rec := postEvents(h, body)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Ingest_rateLimited(t *testing.T) {
	svc := &mockAnalyticsService{limited: true}
	h := NewAnalyticsHandler(svc)
	rec := postEvents(h, validBatch())
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", rec.Code)
	}
	if svc.ingested {
		t.Fatal("service must not ingest when rate limited")
	}
}

func TestAnalyticsHandler_Ingest_serviceError(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{ingestErr: errors.New("db down")})
	rec := postEvents(h, validBatch())
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

// ---- Admin reads ------------------------------------------------------------

func getAdmin(h http.HandlerFunc, target string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestAnalyticsHandler_Overview_success(t *testing.T) {
	svc := &mockAnalyticsService{overview: &model.AnalyticsOverview{
		From: "2026-10-01", To: "2026-10-07", Audience: "public",
		Current: model.AnalyticsTotals{Visitors: 42},
	}}
	h := NewAnalyticsHandler(svc)

	rec := getAdmin(h.Overview, "/api/v1/admin/analytics/overview?from=2026-10-01&to=2026-10-07")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
	var out model.AnalyticsOverview
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("bad JSON: %v", err)
	}
	if out.Current.Visitors != 42 {
		t.Fatalf("expected visitors 42, got %d", out.Current.Visitors)
	}
	if svc.gotFrom.Format("2006-01-02") != "2026-10-01" || svc.gotTo.Format("2006-01-02") != "2026-10-07" {
		t.Fatalf("range not forwarded: %s..%s", svc.gotFrom, svc.gotTo)
	}
}

func TestAnalyticsHandler_Audience_defaultsToPublic(t *testing.T) {
	svc := &mockAnalyticsService{overview: &model.AnalyticsOverview{}}
	h := NewAnalyticsHandler(svc)
	getAdmin(h.Overview, "/api/v1/admin/analytics/overview")
	if svc.gotAudience != "public" {
		t.Fatalf("expected default audience public, got %q", svc.gotAudience)
	}
}

func TestAnalyticsHandler_Audience_forwardedOnEveryRead(t *testing.T) {
	svc := &mockAnalyticsService{overview: &model.AnalyticsOverview{}}
	h := NewAnalyticsHandler(svc)
	cases := []struct {
		fn     http.HandlerFunc
		target string
	}{
		{h.Overview, "/api/v1/admin/analytics/overview?audience=admin"},
		{h.Timeseries, "/api/v1/admin/analytics/timeseries?metric=visitors&audience=admin"},
		{h.Breakdown, "/api/v1/admin/analytics/breakdown?dimension=path&audience=admin"},
		{h.Content, "/api/v1/admin/analytics/content?audience=admin"},
	}
	for _, c := range cases {
		svc.gotAudience = ""
		if rec := getAdmin(c.fn, c.target); rec.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d body=%s", c.target, rec.Code, rec.Body)
		}
		if svc.gotAudience != "admin" {
			t.Fatalf("%s: audience not forwarded, got %q", c.target, svc.gotAudience)
		}
	}
	svc.gotAudience = ""
	getAdmin(h.Overview, "/api/v1/admin/analytics/overview?audience=all")
	if svc.gotAudience != "all" {
		t.Fatalf("expected all, got %q", svc.gotAudience)
	}
}

func TestAnalyticsHandler_Audience_badValue(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{overview: &model.AnalyticsOverview{}})
	rec := getAdmin(h.Overview, "/api/v1/admin/analytics/overview?audience=everyone")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown audience, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Overview_defaultsToLast30Days(t *testing.T) {
	svc := &mockAnalyticsService{overview: &model.AnalyticsOverview{}}
	h := NewAnalyticsHandler(svc)

	rec := getAdmin(h.Overview, "/api/v1/admin/analytics/overview")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	days := int(svc.gotTo.Sub(svc.gotFrom).Hours()/24) + 1
	if days != 30 {
		t.Fatalf("expected a 30-day default window, got %d days", days)
	}
}

func TestAnalyticsHandler_Overview_badRange(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{overview: &model.AnalyticsOverview{}})
	for _, q := range []string{
		"?from=2026-10-07&to=2026-10-01",
		"?from=not-a-date",
		"?from=2020-01-01&to=2026-10-01",
	} {
		rec := getAdmin(h.Overview, "/api/v1/admin/analytics/overview"+q)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d", q, rec.Code)
		}
	}
}

func TestAnalyticsHandler_Overview_serviceError(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{readErr: errors.New("boom")})
	rec := getAdmin(h.Overview, "/api/v1/admin/analytics/overview")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Timeseries_success(t *testing.T) {
	svc := &mockAnalyticsService{points: []model.AnalyticsPoint{{Day: "2026-10-01", Value: 3}}}
	h := NewAnalyticsHandler(svc)

	rec := getAdmin(h.Timeseries, "/api/v1/admin/analytics/timeseries?metric=visitors&dimension=vi&bucket=week&from=2026-10-01&to=2026-10-07")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
	if svc.gotMetric != "visitors" || svc.gotDim != "vi" || svc.gotBucket != "week" {
		t.Fatalf("params not forwarded: metric=%s dim=%s bucket=%s", svc.gotMetric, svc.gotDim, svc.gotBucket)
	}
	var out struct {
		Points []model.AnalyticsPoint `json:"points"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || len(out.Points) != 1 {
		t.Fatalf("expected one point, body=%s err=%v", rec.Body, err)
	}
}

func TestAnalyticsHandler_Timeseries_returnsEmptyArrayNotNull(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{points: nil})
	rec := getAdmin(h.Timeseries, "/api/v1/admin/analytics/timeseries?metric=visitors")
	if !strings.Contains(rec.Body.String(), `"points":[]`) {
		t.Fatalf("expected empty array, body=%s", rec.Body)
	}
}

func TestAnalyticsHandler_Timeseries_badMetricOrBucket(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	for _, q := range []string{"?metric=passwords", "?metric=visitors&bucket=minute", "?metric="} {
		rec := getAdmin(h.Timeseries, "/api/v1/admin/analytics/timeseries"+q)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d", q, rec.Code)
		}
	}
}

func TestAnalyticsHandler_Breakdown_success(t *testing.T) {
	svc := &mockAnalyticsService{rows: []model.AnalyticsBreakdownRow{{Dimension: "/events", Value: 10, Share: 1}}}
	h := NewAnalyticsHandler(svc)

	rec := getAdmin(h.Breakdown, "/api/v1/admin/analytics/breakdown?dimension=path&limit=5")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
	if svc.gotDim != "path" || svc.gotLimit != 5 {
		t.Fatalf("params not forwarded: dim=%s limit=%d", svc.gotDim, svc.gotLimit)
	}
}

func TestAnalyticsHandler_Breakdown_badDimension(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	rec := getAdmin(h.Breakdown, "/api/v1/admin/analytics/breakdown?dimension=visitor_hash")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestAnalyticsHandler_Breakdown_clampsLimit(t *testing.T) {
	svc := &mockAnalyticsService{}
	h := NewAnalyticsHandler(svc)
	getAdmin(h.Breakdown, "/api/v1/admin/analytics/breakdown?dimension=path&limit=9999")
	if svc.gotLimit != maxBreakdownLimit {
		t.Fatalf("expected limit clamped to %d, got %d", maxBreakdownLimit, svc.gotLimit)
	}
}

func TestAnalyticsHandler_Content_and_Pipeline_and_Requests(t *testing.T) {
	svc := &mockAnalyticsService{
		content:  []model.ContentStat{{PostID: "p1", Title: "Thanksgiving", Reads: 7}},
		pipeline: &model.PipelineStats{TranslationsProduced: 5, ApprovedUnedited: 4},
		routes:   []model.RouteStat{{Route: "/api/v1/posts", Count: 100, P95Ms: 120}},
	}
	h := NewAnalyticsHandler(svc)

	if rec := getAdmin(h.Content, "/api/v1/admin/analytics/content"); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Thanksgiving") {
		t.Fatalf("content: got %d body=%s", rec.Code, rec.Body)
	}
	if rec := getAdmin(h.Pipeline, "/api/v1/admin/analytics/pipeline"); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"approved_unedited":4`) {
		t.Fatalf("pipeline: got %d body=%s", rec.Code, rec.Body)
	}
	if rec := getAdmin(h.Requests, "/api/v1/admin/analytics/requests"); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"p95_ms":120`) {
		t.Fatalf("requests: got %d body=%s", rec.Code, rec.Body)
	}
}

func TestAnalyticsHandler_Content_returnsEmptyArrayNotNull(t *testing.T) {
	h := NewAnalyticsHandler(&mockAnalyticsService{})
	rec := getAdmin(h.Content, "/api/v1/admin/analytics/content")
	if !strings.Contains(rec.Body.String(), `"items":[]`) {
		t.Fatalf("expected empty items array, body=%s", rec.Body)
	}
}
