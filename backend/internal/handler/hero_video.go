package handler

import (
	"context"
	"encoding/json"
	"log"
	"mime/multipart"
	"net/http"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// HeroVideoService is the contract this handler requires.
type HeroVideoService interface {
	UploadHeroVideo(ctx context.Context, file multipart.File, header *multipart.FileHeader, uploadedBy *string) (*model.HeroVideo, error)
	GetActiveHeroVideo(ctx context.Context) (*model.HeroVideo, error)
}

type HeroVideoHandler struct {
	svc HeroVideoService
}

func NewHeroVideoHandler(svc HeroVideoService) *HeroVideoHandler {
	return &HeroVideoHandler{svc: svc}
}

// UploadVideo handles POST /api/v1/admin/hero-video. Accepts a single video file
// via multipart form (field name: "video"), validates it, uploads to S3, and
// replaces the current hero background on the homepage.
// Requires admin authentication (enforced by RequireAdmin middleware).
func (h *HeroVideoHandler) UploadVideo(w http.ResponseWriter, r *http.Request) {
	// Cap the request body at 100MB. ParseMultipartForm only limits how much
	// is held in memory - MaxBytesReader hard-stops the read at the network
	// level. This matches model.MaxHeroVideoBytes.
	r.Body = http.MaxBytesReader(w, r.Body, model.MaxHeroVideoBytes)
	if err := r.ParseMultipartForm(model.MaxHeroVideoBytes); err != nil {
		http.Error(w, "file too large or invalid form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("video")
	if err != nil {
		http.Error(w, "missing video field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Extract the uploading admin's UUID from the request context.
	// Set by RequireAdmin middleware after validating the JWT.
	// Upload invalidates the cached hero video so changes appear immediately.
	uploadedBy := middleware.UserIDFromContext(r.Context())
	v, err := h.svc.UploadHeroVideo(r.Context(), file, header, &uploadedBy)
	if err != nil {
		log.Printf("UploadVideo: %v", err)
		http.Error(w, "upload failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(v)
}

// GetVideo handles GET /api/v1/hero-video. Returns the currently active hero
// background video with a presigned URL. Returns null if no video has been
// uploaded yet (valid initial state).
// Public endpoint - no authentication required.
func (h *HeroVideoHandler) GetVideo(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.GetActiveHeroVideo(r.Context())
	if err != nil {
		log.Printf("GetVideo: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if v == nil {
		// No video uploaded yet - send null payload instead of empty object.
		w.Write([]byte("null"))
	} else {
		json.NewEncoder(w).Encode(v)
	}
}
