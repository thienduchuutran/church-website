package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// pageService is the interface the handler depends on.
// Keeping it an interface lets tests swap in the mockPageService without a real database.
type pageService interface {
	GetPageContent(ctx context.Context, slug, locale string) (sections map[string]string, machineTranslated bool, err error)
	UpdatePageContent(ctx context.Context, slug string, sections map[string]string) error
	GetPageBlocks(ctx context.Context, slug, locale string) ([]model.PageBlock, bool, error)
	ReplacePageBlocks(ctx context.Context, slug string, blocks []model.PageBlock) error
}

// PageHandler handles page content endpoints.
type PageHandler struct {
	svc pageService
}

func NewPageHandler(svc pageService) *PageHandler {
	return &PageHandler{svc: svc}
}

// pageResponse is the JSON shape returned by GET /pages/:slug. Both sections
// and blocks are included so Connect (sections) and About (blocks) work from
// the same endpoint. machineTranslated is omitted on English responses (zero
// value) so the existing API stays backwards compatible.
type pageResponse struct {
	Sections          map[string]string `json:"sections"`
	Blocks            []model.PageBlock `json:"blocks"`
	MachineTranslated bool              `json:"machine_translated,omitempty"`
}

// Get handles GET /api/v1/pages/:slug. Accepts ?locale=<code> for translated
// content; missing or "en" returns the English source unchanged.
// Returns both sections (flat key-value) and blocks (ordered typed array).
func (h *PageHandler) Get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}

	locale := r.URL.Query().Get("locale")

	sections, machineTranslated, err := h.svc.GetPageContent(r.Context(), slug, locale)
	if err != nil {
		log.Printf("GetPageContent error for slug %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch page content")
		return
	}

	// Return {} not null so the frontend can iterate without a nil check.
	if sections == nil {
		sections = map[string]string{}
	}

	// Fetch blocks. A failure here is non-fatal - the response still includes
	// sections, so the frontend has something to render (Connect doesn't use
	// blocks at all; About can fall back to section defaults).
	var blocks []model.PageBlock
	blocksMachine := false
	blks, bm, err := h.svc.GetPageBlocks(r.Context(), slug, locale)
	if err != nil {
		log.Printf("GetPageBlocks error for slug %s (non-fatal): %v", slug, err)
	} else {
		blocks = blks
		if bm {
			blocksMachine = true
		}
	}
	if blocks == nil {
		blocks = []model.PageBlock{}
	}

	writeJSON(w, http.StatusOK, pageResponse{
		Sections:          sections,
		Blocks:            blocks,
		MachineTranslated: machineTranslated || blocksMachine,
	})
}

// updatePageRequest accepts either sections (legacy Connect path) or blocks
// (new About block-model path). The handler checks which field is populated
// and dispatches accordingly.
type updatePageRequest struct {
	Sections map[string]string `json:"sections"`
	Blocks   []blockInput      `json:"blocks"`
}

// blockInput is the per-block shape the admin sends on PUT. Props defaults
// to {} when omitted.
type blockInput struct {
	ID        string         `json:"id"`
	BlockType string         `json:"block_type"`
	Title     string         `json:"title"`
	Content   string         `json:"content"`
	Props     map[string]any `json:"props"`
}

// Update handles PUT /api/v1/pages/:slug.
//
// Two modes:
//   - {sections: {...}}  → partial upsert (unchanged, Connect path)
//   - {blocks: [...]}    → full replace (new About block-model path)
//
// If both are populated, blocks wins. blocks:[] is rejected (400).
func (h *PageHandler) Update(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}

	var req updatePageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Dispatch: blocks path takes priority when present.
	if req.Blocks != nil {
		if len(req.Blocks) == 0 {
			writeError(w, http.StatusBadRequest, "blocks must contain at least one block")
			return
		}

		// Validate each block.
		for i, b := range req.Blocks {
			if b.BlockType == "" {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("block %d: block_type is required", i))
				return
			}
			if !model.AllowedBlockTypes[b.BlockType] {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("block %d: unknown block_type %q", i, b.BlockType))
				return
			}
		}

		// Convert to model.PageBlock slice.
		blocks := make([]model.PageBlock, len(req.Blocks))
		for i, b := range req.Blocks {
			props := b.Props
			if props == nil {
				props = map[string]any{}
			}
			blocks[i] = model.PageBlock{
				ID:        b.ID,
				BlockType: b.BlockType,
				Position:  i,
				Title:     b.Title,
				Content:   b.Content,
				Props:     props,
			}
		}

		if err := h.svc.ReplacePageBlocks(r.Context(), slug, blocks); err != nil {
			log.Printf("ReplacePageBlocks error for slug %s: %v", slug, err)
			writeError(w, http.StatusInternalServerError, "failed to update page blocks")
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Legacy sections path.
	if len(req.Sections) == 0 {
		writeError(w, http.StatusBadRequest, "sections must contain at least one key")
		return
	}

	if err := h.svc.UpdatePageContent(r.Context(), slug, req.Sections); err != nil {
		log.Printf("UpdatePageContent error for slug %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to update page content")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
