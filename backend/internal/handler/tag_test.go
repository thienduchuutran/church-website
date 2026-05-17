package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// parseTime is a test helper for creating timestamps.
func parseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

// mockTagService is an in-memory stub for tag handler tests.
type mockTagService struct {
	tags       []model.Tag
	tagsErr    error
	createErr  error
	createdTag *model.Tag
	replaceErr error
	removeErr  error
}

func (m *mockTagService) GetAll(ctx context.Context) ([]model.Tag, error) {
	return m.tags, m.tagsErr
}

func (m *mockTagService) Create(ctx context.Context, name string, userID string) (*model.Tag, error) {
	return m.createdTag, m.createErr
}

func (m *mockTagService) Replace(ctx context.Context, postID string, tagIDs []string) error {
	return m.replaceErr
}

func (m *mockTagService) RemoveTag(ctx context.Context, postID string, tagID string) error {
	return m.removeErr
}

func withPostID(r *http.Request, id string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func withPostAndTagID(r *http.Request, postID, tagID string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", postID)
	rctx.URLParams.Add("tag_id", tagID)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestTagHandler_List_success(t *testing.T) {
	h := NewTagHandler(&mockTagService{
		tags: []model.Tag{
			{ID: "tag1", Name: "worship", CreatedAt: parseTime("2026-05-15T10:00:00Z")},
			{ID: "tag2", Name: "fellowship", CreatedAt: parseTime("2026-05-15T11:00:00Z")},
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tags", nil)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var tags []model.Tag
	if err := json.NewDecoder(rec.Body).Decode(&tags); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(tags) != 2 || tags[0].Name != "worship" {
		t.Fatalf("unexpected tags: %+v", tags)
	}
}

func TestTagHandler_List_empty(t *testing.T) {
	h := NewTagHandler(&mockTagService{tags: []model.Tag{}})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tags", nil)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var tags []model.Tag
	if err := json.NewDecoder(rec.Body).Decode(&tags); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if tags == nil || len(tags) != 0 {
		t.Fatalf("expected empty array, got %+v", tags)
	}
}

func TestTagHandler_Create_success(t *testing.T) {
	createdTag := model.Tag{ID: "new-id", Name: "prayer", CreatedAt: parseTime("2026-05-15T10:00:00Z")}
	h := NewTagHandler(&mockTagService{createdTag: &createdTag})
	body := `{"name":"prayer"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tags", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body)
	}
	var tag model.Tag
	if err := json.NewDecoder(rec.Body).Decode(&tag); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if tag.Name != "prayer" {
		t.Fatalf("expected name=prayer, got %s", tag.Name)
	}
}

func TestTagHandler_Create_missingName(t *testing.T) {
	h := NewTagHandler(&mockTagService{})
	body := `{"name":""}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tags", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestTagHandler_Create_conflict(t *testing.T) {
	h := NewTagHandler(&mockTagService{
		createErr: model.ErrAlreadyExists,
	})
	body := `{"name":"worship"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tags", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", rec.Code)
	}
}

func TestTagHandler_Replace_success(t *testing.T) {
	h := NewTagHandler(&mockTagService{})
	body := `{"tag_ids":["id1","id2"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/posts/post-abc/tags", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withPostID(req, "post-abc")
	rec := httptest.NewRecorder()

	h.Replace(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestTagHandler_Remove_success(t *testing.T) {
	h := NewTagHandler(&mockTagService{})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/posts/post-abc/tags/tag-123", nil)
	req = withPostAndTagID(req, "post-abc", "tag-123")
	rec := httptest.NewRecorder()

	h.Remove(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}
