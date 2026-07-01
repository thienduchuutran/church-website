package handler

import (
	"context"
	"log"
	"mime/multipart"
	"net/http"
)

// UploadService is the contract this handler needs. The real implementation is
// service.UploadService; the mock in uploads_test.go also satisfies it.
type UploadService interface {
	UploadEditorImage(ctx context.Context, file multipart.File, header *multipart.FileHeader) (string, error)
}

type UploadHandler struct {
	svc UploadService
}

func NewUploadHandler(svc UploadService) *UploadHandler {
	return &UploadHandler{svc: svc}
}

// UploadImage handles POST /api/v1/uploads/image - an admin dropping an image
// into the post editor. Stores it in R2 and returns its permanent public URL,
// which the editor embeds as an <img> in the body. Admin-only (mutates storage);
// the route is registered inside the RequireAdmin group.
func (h *UploadHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	// Cap the request body at 10MB. MaxBytesReader hard-stops the read at the
	// network level so a large upload can't exhaust server memory.
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "file too large or invalid form")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing image field")
		return
	}
	defer file.Close()

	// Validate the file's own Content-Type (set per-part by the browser). Reuses
	// the gallery handler's allowedImageTypes whitelist.
	contentType := header.Header.Get("Content-Type")
	if !allowedImageTypes[contentType] {
		writeError(w, http.StatusBadRequest, "unsupported file type - use jpeg, png, webp, or gif")
		return
	}

	url, err := h.svc.UploadEditorImage(r.Context(), file, header)
	if err != nil {
		log.Printf("UploadEditorImage: %v", err)
		writeError(w, http.StatusInternalServerError, "upload failed")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"url": url})
}
