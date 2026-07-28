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
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// mockPageService is an in-memory stub so handler tests don't need a real DB.
type mockPageService struct {
	sections          map[string]string
	machineTranslated bool
	getErr            error
	updateErr         error

	// Block-related fields
	blocks          []model.PageBlock
	blocksErr       error
	replaceErr      error
	replacedBlocks  []model.PageBlock // captures what was passed to ReplacePageBlocks
}

func (m *mockPageService) GetPageContent(_ context.Context, _, _ string) (map[string]string, bool, error) {
	return m.sections, m.machineTranslated, m.getErr
}

func (m *mockPageService) UpdatePageContent(_ context.Context, _ string, _ map[string]string) error {
	return m.updateErr
}

func (m *mockPageService) GetPageBlocks(_ context.Context, _, _ string) ([]model.PageBlock, bool, error) {
	return m.blocks, m.machineTranslated, m.blocksErr
}

func (m *mockPageService) ReplacePageBlocks(_ context.Context, _ string, blocks []model.PageBlock) error {
	m.replacedBlocks = blocks
	return m.replaceErr
}

// withSlug injects a chi route param so handlers can call chi.URLParam.
func withSlug(r *http.Request, slug string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", slug)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// ---------------------------------------------------------------------------
// Existing section-based tests (unchanged)
// ---------------------------------------------------------------------------

func TestPageHandler_Get_success(t *testing.T) {
	svc := &mockPageService{
		sections: map[string]string{
			"hero_title":    "About Our Church",
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
	var got pageResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got.Sections["hero_title"] != "About Our Church" {
		t.Fatalf("expected hero_title='About Our Church', got %q", got.Sections["hero_title"])
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
	var got pageResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got.Sections == nil {
		t.Fatalf("expected non-nil sections map, got nil")
	}
	if len(got.Sections) != 0 {
		t.Fatalf("expected empty sections, got %v", got.Sections)
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

// ---------------------------------------------------------------------------
// Block-based tests (new - TDD: these exercise the block read/replace paths)
// ---------------------------------------------------------------------------

func TestPageHandler_Get_includesBlocks(t *testing.T) {
	// GET /pages/about should return both sections and blocks in the response.
	svc := &mockPageService{
		sections: map[string]string{},
		blocks: []model.PageBlock{
			{ID: "aaa", BlockType: "hero", Position: 0, Title: "About Us", Content: "Welcome"},
			{ID: "bbb", BlockType: "rich_text", Position: 1, Title: "Mission", Content: "<p>Our mission</p>"},
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

	var got pageResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(got.Blocks) != 2 {
		t.Fatalf("expected 2 blocks, got %d", len(got.Blocks))
	}
	if got.Blocks[0].BlockType != "hero" {
		t.Fatalf("expected first block type='hero', got %q", got.Blocks[0].BlockType)
	}
	if got.Blocks[1].Title != "Mission" {
		t.Fatalf("expected second block title='Mission', got %q", got.Blocks[1].Title)
	}
}

func TestPageHandler_Get_blocksServiceError(t *testing.T) {
	// If GetPageBlocks fails, the handler should still return sections successfully.
	// blocks field will be empty/nil - not a hard error since sections are the fallback.
	svc := &mockPageService{
		sections:  map[string]string{"hero_title": "Hi"},
		blocksErr: errors.New("blocks query failed"),
	}
	h := NewPageHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/pages/about", nil)
	req = withSlug(req, "about")
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	// Should still return 200 with sections - blocks failure is non-fatal
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
}

func TestPageHandler_Update_blocksSuccess(t *testing.T) {
	// PUT /pages/about with blocks array should call ReplacePageBlocks
	svc := &mockPageService{}
	h := NewPageHandler(svc)
	body := `{"blocks":[{"block_type":"hero","title":"About","content":"Welcome","props":{}},{"block_type":"rich_text","title":"Mission","content":"<p>text</p>","props":{}}]}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d body=%s", rec.Code, rec.Body)
	}
	if len(svc.replacedBlocks) != 2 {
		t.Fatalf("expected 2 blocks passed to service, got %d", len(svc.replacedBlocks))
	}
}

func TestPageHandler_Update_blocksEmptyArray(t *testing.T) {
	// PUT /pages/about with blocks:[] should return 400 - cannot make page empty
	h := NewPageHandler(&mockPageService{})
	body := `{"blocks":[]}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rec.Code, rec.Body)
	}
}

func TestPageHandler_Update_blocksUnknownType(t *testing.T) {
	// PUT with an unrecognized block_type should return 400
	h := NewPageHandler(&mockPageService{})
	body := `{"blocks":[{"block_type":"evil_script","title":"X","content":"Y","props":{}}]}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rec.Code, rec.Body)
	}
}

func TestPageHandler_Update_blocksServiceError(t *testing.T) {
	// PUT with valid blocks but service error should return 500
	svc := &mockPageService{replaceErr: errors.New("db down")}
	h := NewPageHandler(svc)
	body := `{"blocks":[{"block_type":"rich_text","title":"X","content":"Y","props":{}}]}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d body=%s", rec.Code, rec.Body)
	}
}

func TestPageHandler_Update_blocksMissingType(t *testing.T) {
	// A block with an empty block_type should be rejected
	h := NewPageHandler(&mockPageService{})
	body := `{"blocks":[{"block_type":"","title":"X","content":"Y","props":{}}]}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/pages/about", bytes.NewBufferString(body))
	req = withSlug(req, "about")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rec.Code, rec.Body)
	}
}
