package handler

import (
	"context"
	"encoding/json"
	"log"
	"mime/multipart"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// GalleryService is the contract this handler requires.
// The real implementation lives in service/gallery.go.
// The mock in gallery_test.go also satisfies this interface.
type GalleryService interface {
	AddImageToPost(ctx context.Context, postID string, file multipart.File, header *multipart.FileHeader) (*model.PostImage, error)
}

type GalleryHandler struct {
	svc GalleryService
}

func NewGalleryHandler(svc GalleryService) *GalleryHandler {
	return &GalleryHandler{svc: svc}
}

// allowedImageTypes is the whitelist of content-types we accept.
// Anything not in this map is rejected before it reaches S3.
var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

func (h *GalleryHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	postID := chi.URLParam(r, "id")

	// Cap the request body at 10MB. ParseMultipartForm only limits how much
	// is held in memory - MaxBytesReader hard-stops the read at the network
	// level, preventing a large upload from exhausting server resources.
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "file too large or invalid form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "missing image field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate the file's own Content-Type header (set per-part by the browser).
	// We check the part header, not the request header, because the request
	// header just says "multipart/form-data" - it says nothing about the file.
	contentType := header.Header.Get("Content-Type")
	if !allowedImageTypes[contentType] {
		http.Error(w, "unsupported file type - use jpeg, png, webp, or gif", http.StatusBadRequest)
		return
	}

	img, err := h.svc.AddImageToPost(r.Context(), postID, file, header)
	if err != nil {
		log.Printf("UploadImage: %v", err)
		http.Error(w, "upload failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"key": img.StorageKey})
}
