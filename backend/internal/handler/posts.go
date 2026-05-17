package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/service"
)

type PostHandler struct {
	svc *service.PostService
}

func NewPostHandler(svc *service.PostService) *PostHandler {
	return &PostHandler{svc: svc}
}

// Create handles POST /api/v1/posts.
func (h *PostHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	post, err := h.svc.Create(r.Context(), req, userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, post)
}

// List handles GET /api/v1/posts?type=event&limit=20&offset=0&tags=uuid1,uuid2.
// Defaults match docs/api.md: limit=20, offset=0. The hard cap of 100 stops a
// caller from accidentally pulling the entire table in one request.
// If tags is provided, only gallery_album posts with any of those tags are returned.
func (h *PostHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	var postType *model.PostType
	if t := q.Get("type"); t != "" {
		pt := model.PostType(t)
		postType = &pt
	}

	var tagIDs []string
	if tags := q.Get("tags"); tags != "" {
		tagIDs = strings.Split(tags, ",")
	}

	limit := 20
	if v := q.Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 100 {
		limit = 100
	}

	offset := 0
	if v := q.Get("offset"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	posts, err := h.svc.List(r.Context(), postType, tagIDs, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if posts == nil {
		posts = []model.Post{}
	}
	writeJSON(w, http.StatusOK, posts)
}

// Get handles GET /api/v1/posts/{id}.
func (h *PostHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	post, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, post)
}

// Update handles PATCH /api/v1/posts/{id}.
func (h *PostHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	post, err := h.svc.Update(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, post)
}

// Delete handles DELETE /api/v1/posts/{id}.
func (h *PostHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
