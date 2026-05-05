package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// pageService is the interface the handler depends on.
// Keeping it an interface lets tests swap in the mockPageService without a real database.
type pageService interface {
	GetPageContent(ctx context.Context, slug string) (map[string]string, error)
	UpdatePageContent(ctx context.Context, slug string, sections map[string]string) error
}

// PageHandler handles page content endpoints.
type PageHandler struct {
	svc pageService
}

func NewPageHandler(svc pageService) *PageHandler {
	return &PageHandler{svc: svc}
}

// Get handles GET /api/v1/pages/:slug - returns all sections for a page.
func (h *PageHandler) Get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}

	sections, err := h.svc.GetPageContent(r.Context(), slug)
	if err != nil {
		log.Printf("GetPageContent error for slug %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch page content")
		return
	}

	// Return {} not null so the frontend can iterate without a nil check.
	if sections == nil {
		sections = map[string]string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"sections": sections})
}

// updatePageRequest mirrors model.UpdatePageRequest but is local to the handler
// to keep JSON decoding concerns out of the model package.
type updatePageRequest struct {
	Sections map[string]string `json:"sections"`
}

// Update handles PUT /api/v1/pages/:slug - upserts sections for a page (admin only).
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
