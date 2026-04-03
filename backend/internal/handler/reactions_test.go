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
	upsertErr    error
	deleteErr    error
	counts       []model.ReactionCount
	countsErr    error
	myReaction   *string
	myReactionErr error
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
func (m *mockReactionService) GetMyReaction(_ context.Context, _, _ string) (*string, error) {
	return m.myReaction, m.myReactionErr
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

// TestReactionHandler_GetCounts_success verifies the combined ReactionSummary response shape.
func TestReactionHandler_GetCounts_success(t *testing.T) {
	emoji := "👍"
	svc := &mockReactionService{
		counts: []model.ReactionCount{
			{Emoji: "👍", Count: 3},
			{Emoji: "❤️", Count: 1},
		},
		myReaction: &emoji,
	}
	h := NewReactionHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/reactions/abc?fingerprint=fp1", nil)
	req = withPostID(req, "abc")
	rec := httptest.NewRecorder()

	h.GetCounts(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got model.ReactionSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(got.Counts) != 2 {
		t.Fatalf("expected 2 counts, got %d: %+v", len(got.Counts), got.Counts)
	}
	if got.MyReaction == nil || *got.MyReaction != "👍" {
		t.Fatalf("expected my_reaction=👍, got %v", got.MyReaction)
	}
}

// TestReactionHandler_GetCounts_noFingerprint verifies my_reaction is nil when no fingerprint is given.
func TestReactionHandler_GetCounts_noFingerprint(t *testing.T) {
	svc := &mockReactionService{
		counts: []model.ReactionCount{{Emoji: "👍", Count: 1}},
	}
	h := NewReactionHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/reactions/abc", nil)
	req = withPostID(req, "abc")
	rec := httptest.NewRecorder()

	h.GetCounts(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got model.ReactionSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got.MyReaction != nil {
		t.Fatalf("expected nil my_reaction when fingerprint is absent, got %v", got.MyReaction)
	}
}

// TestReactionHandler_GetCounts_emptyReturnsArray verifies counts is [] not null when no reactions exist.
func TestReactionHandler_GetCounts_emptyReturnsArray(t *testing.T) {
	h := NewReactionHandler(&mockReactionService{counts: nil})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/reactions/abc", nil)
	req = withPostID(req, "abc")
	rec := httptest.NewRecorder()

	h.GetCounts(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got model.ReactionSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got.Counts == nil {
		t.Fatalf("expected non-nil counts slice, got nil")
	}
	if len(got.Counts) != 0 {
		t.Fatalf("expected empty counts, got %v", got.Counts)
	}
}
