package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// mockPageService is an in-memory stub so handler tests don't need a real DB.
type mockPageService struct {
	sections          map[string]string
	machineTranslated bool
	getErr            error
	updateErr         error
}

func (m *mockPageService) GetPageContent(_ context.Context, _, _ string) (map[string]string, bool, error) {
	return m.sections, m.machineTranslated, m.getErr
}

func (m *mockPageService) UpdatePageContent(_ context.Context, _ string, _ map[string]string) error {
	return m.updateErr
}

// withSlug injects a chi route param so handlers can call chi.URLParam.
func withSlug(r *http.Request, slug string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", slug)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestPageHandler_Get_success(t *testing.T) {
	svc := &mockPageService{
		sections: map[string]string{
			"hero_title": "About Our Church",
			"hero_subtitle": "Welcome",
		},
	}
	h := NewPageHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/pages/about", nil)
	req = withSlug(req, "about")
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
	var got map[string]map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["sections"]["hero_title"] != "About Our Church" {
		t.Fatalf("expected hero_title='About Our Church', got %q", got["sections"]["hero_title"])
	}
}

func TestPageHandler_Get_emptyReturnsEmptyMap(t *testing.T) {
	svc := &mockPageService{sections: nil}
	h := NewPageHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/pages/about", nil)
	req = withSlug(req, "about")
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got map[string]map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["sections"] == nil {
		t.Fatalf("expected non-nil sections map, got nil")
	}
	if len(got["sections"]) != 0 {
		t.Fatalf("expected empty sections, got %v", got["sections"])
	}
}

func TestPageHandler_Get_missingSlug(t *testing.T) {
	h := NewPageHandler(&mockPageService{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/pages/", nil)
	req = withSlug(req, "")
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPageHandler_Get_serviceError(t *testing.T) {
	svc := &mockPageService{getErr: errors.New("db down")}
	h := NewPageHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/pages/about", nil)
	req = withSlug(req, "about")
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestPageHandler_Update_success(t *testing.T) {
	svc := &mockPageService{}
	h := NewPageHandler(svc)
	body := `{"sections":{"hero_title":"New Title","hero_subtitle":"New Sub"}}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d body=%s", rec.Code, rec.Body)
	}
}

func TestPageHandler_Update_missingSlug(t *testing.T) {
	h := NewPageHandler(&mockPageService{})
	body := `{"sections":{"hero_title":"X"}}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/", bytes.NewBufferString(body))
	req = withSlug(req, "")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPageHandler_Update_invalidBody(t *testing.T) {
	h := NewPageHandler(&mockPageService{})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString("not json"))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPageHandler_Update_emptySections(t *testing.T) {
	h := NewPageHandler(&mockPageService{})
	body := `{"sections":{}}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPageHandler_Update_serviceError(t *testing.T) {
	svc := &mockPageService{updateErr: errors.New("db down")}
	h := NewPageHandler(svc)
	body := `{"sections":{"hero_title":"X"}}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d body=%s", rec.Code, rec.Body)
	}
}
