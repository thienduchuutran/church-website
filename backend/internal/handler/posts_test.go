package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// mockPostService is an in-memory stub of the postService interface so handler
// tests run without a real database. Only the fields a given test needs are set;
// the rest return zero values.
type mockPostService struct {
	archived    *model.Post
	archivedErr error
}

func (m *mockPostService) Create(context.Context, model.CreatePostRequest, string, string) (*model.Post, error) {
	return nil, nil
}
func (m *mockPostService) List(context.Context, *model.PostType, []string, int, int, string) ([]model.Post, error) {
	return nil, nil
}
func (m *mockPostService) Get(context.Context, string, string) (*model.Post, error) {
	return nil, nil
}
func (m *mockPostService) Update(context.Context, string, model.UpdatePostRequest) (*model.Post, error) {
	return nil, nil
}
func (m *mockPostService) Delete(context.Context, string) error { return nil }
func (m *mockPostService) SetArchived(_ context.Context, _ string, _ bool) (*model.Post, error) {
	return m.archived, m.archivedErr
}

// withID injects a chi "id" route param so Archive can call chi.URLParam.
func withID(r *http.Request, id string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// archived=true returns 200 with archived_at populated (event moved to Past).
func TestPostHandler_Archive_setTrue(t *testing.T) {
	now := time.Now()
	svc := &mockPostService{archived: &model.Post{ID: "abc", Type: model.PostTypeEvent, ArchivedAt: &now}}
	h := NewPostHandler(svc)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/posts/abc/archive", bytes.NewBufferString(`{"archived":true}`))
	req = withID(req, "abc")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Archive(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
	var got model.Post
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got.ArchivedAt == nil {
		t.Fatalf("expected archived_at to be set, got nil")
	}
}

// archived=false returns 200 with archived_at null (event moved back to Upcoming).
func TestPostHandler_Archive_setFalse(t *testing.T) {
	svc := &mockPostService{archived: &model.Post{ID: "abc", Type: model.PostTypeEvent, ArchivedAt: nil}}
	h := NewPostHandler(svc)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/posts/abc/archive", bytes.NewBufferString(`{"archived":false}`))
	req = withID(req, "abc")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Archive(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
	var got model.Post
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got.ArchivedAt != nil {
		t.Fatalf("expected archived_at nil, got %v", got.ArchivedAt)
	}
}

func TestPostHandler_Archive_invalidBody(t *testing.T) {
	h := NewPostHandler(&mockPostService{})
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/posts/abc/archive", bytes.NewBufferString(`not json`))
	req = withID(req, "abc")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Archive(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPostHandler_Archive_notFound(t *testing.T) {
	svc := &mockPostService{archivedErr: model.ErrNotFound}
	h := NewPostHandler(svc)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/posts/missing/archive", bytes.NewBufferString(`{"archived":true}`))
	req = withID(req, "missing")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Archive(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestPostHandler_Archive_serviceError(t *testing.T) {
	svc := &mockPostService{archivedErr: errors.New("boom")}
	h := NewPostHandler(svc)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/posts/abc/archive", bytes.NewBufferString(`{"archived":true}`))
	req = withID(req, "abc")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Archive(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}
