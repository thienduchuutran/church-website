package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// TagService defines the interface the tag handler depends on.
type TagService interface {
	GetAll(ctx context.Context) ([]model.Tag, error)
	Create(ctx context.Context, name, userID string) (*model.Tag, error)
	Replace(ctx context.Context, postID string, tagIDs []string) error
	RemoveTag(ctx context.Context, postID, tagID string) error
}

// TagHandler handles HTTP requests for tags.
type TagHandler struct {
	svc TagService
}

// NewTagHandler creates a new tag handler.
func NewTagHandler(svc TagService) *TagHandler {
	return &TagHandler{svc: svc}
}

// List returns all tags ordered by name. GET /api/v1/tags (public).
func (h *TagHandler) List(w http.ResponseWriter, r *http.Request) {
	tags, err := h.svc.GetAll(r.Context())
	if err != nil {
		log.Printf("get tags: %v", err)
		http.Error(w, `{"error":"failed to load tags"}`, http.StatusInternalServerError)
		return
	}

	if tags == nil {
		tags = []model.Tag{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tags)
}

// Create creates a new tag. POST /api/v1/tags (admin).
func (h *TagHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if err := req.Validate(); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	tag, err := h.svc.Create(r.Context(), req.Name, userID)
	if err != nil {
		if errors.Is(err, model.ErrAlreadyExists) {
			http.Error(w, `{"error":"tag name already exists"}`, http.StatusConflict)
			return
		}
		log.Printf("create tag: %v", err)
		http.Error(w, `{"error":"failed to create tag"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tag)
}

// Replace replaces all tags on a post. POST /api/v1/posts/{id}/tags (admin).
func (h *TagHandler) Replace(w http.ResponseWriter, r *http.Request) {
	postID := chi.URLParam(r, "id")
	if postID == "" {
		http.Error(w, `{"error":"post id required"}`, http.StatusBadRequest)
		return
	}

	var req model.ReplaceTagsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if err := h.svc.Replace(r.Context(), postID, req.TagIDs); err != nil {
		log.Printf("replace tags for post %s: %v", postID, err)
		http.Error(w, `{"error":"failed to update tags"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Remove removes one tag from a post. DELETE /api/v1/posts/{id}/tags/{tag_id} (admin).
func (h *TagHandler) Remove(w http.ResponseWriter, r *http.Request) {
	postID := chi.URLParam(r, "id")
	tagID := chi.URLParam(r, "tag_id")
	if postID == "" || tagID == "" {
		http.Error(w, `{"error":"post id and tag id required"}`, http.StatusBadRequest)
		return
	}

	err := h.svc.RemoveTag(r.Context(), postID, tagID)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			http.Error(w, `{"error":"tag not found"}`, http.StatusNotFound)
			return
		}
		log.Printf("remove tag %s from post %s: %v", tagID, postID, err)
		http.Error(w, `{"error":"failed to remove tag"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
