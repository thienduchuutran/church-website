package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// mockReactionService is an in-memory stub so handler tests don't need a real DB.
type mockReactionService struct {
	upsertErr error
	deleteErr error
	counts    []model.ReactionCount
	countsErr error
}

func (m *mockReactionService) UpsertReaction(_ context.Context, _, _, _ string) error {
	return m.upsertErr
}
func (m *mockReactionService) DeleteReaction(_ context.Context, _, _ string) error {
	return m.deleteErr
}
func (m *mockReactionService) GetCounts(_ context.Context, _ string) ([]model.ReactionCount, error) {
	return m.counts, m.countsErr
}

// withPostID injects a chi route param so handlers can call chi.URLParam.
func withPostID(r *http.Request, id string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("post_id", id)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestReactionHandler_Upsert_success(t *testing.T) {
	h := NewReactionHandler(&mockReactionService{})
	body := `{"post_id":"abc","emoji":"👍","fingerprint":"fp1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/reactions", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Upsert(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d body=%s", rec.Code, rec.Body)
	}
}

func TestReactionHandler_Upsert_missingFields(t *testing.T) {
	h := NewReactionHandler(&mockReactionService{})
	body := `{"post_id":"abc"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/reactions", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Upsert(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestReactionHandler_Upsert_invalidEmoji(t *testing.T) {
	h := NewReactionHandler(&mockReactionService{})
	// 🔥 is not in the allowed set
	body := `{"post_id":"abc","emoji":"🔥","fingerprint":"fp1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/reactions", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Upsert(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestReactionHandler_Delete_success(t *testing.T) {
	h := NewReactionHandler(&mockReactionService{})
	body := `{"fingerprint":"fp1"}`
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/reactions/abc", bytes.NewBufferString(body))
	req = withPostID(req, "abc")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d body=%s", rec.Code, rec.Body)
	}
}

func TestReactionHandler_Delete_missingFingerprint(t *testing.T) {
	h := NewReactionHandler(&mockReactionService{})
	body := `{}`
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/reactions/abc", bytes.NewBufferString(body))
	req = withPostID(req, "abc")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestReactionHandler_GetCounts_success(t *testing.T) {
	svc := &mockReactionService{
		counts: []model.ReactionCount{
			{Emoji: "👍", Count: 3},
			{Emoji: "❤️", Count: 1},
		},
	}
	h := NewReactionHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/reactions/abc", nil)
	req = withPostID(req, "abc")
	rec := httptest.NewRecorder()

	h.GetCounts(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []model.ReactionCount
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 counts, got %d: %+v", len(got), got)
	}
}

func TestReactionHandler_GetCounts_emptyReturnsArray(t *testing.T) {
	// When no reactions exist, response must be [] not null so the frontend can iterate.
	h := NewReactionHandler(&mockReactionService{counts: nil})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/reactions/abc", nil)
	req = withPostID(req, "abc")
	rec := httptest.NewRecorder()

	h.GetCounts(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if body := rec.Body.String(); body != "[]\n" {
		t.Fatalf("expected [] for empty counts, got %q", body)
	}
}
