package service

import (
	"context"
	"fmt"
	"mime/multipart"
	"path/filepath"
	"time"
)

// EditorImageStore is the subset of storage.S3Client the editor-image upload
// needs: store the bytes under a key and produce a PERMANENT public URL. The
// URL is baked into saved body HTML, so a presigned (expiring) URL would 404
// later - hence PublicURL, not PresignedURL. An interface so the service stays
// decoupled from the storage package and a fake can be swapped in for tests.
type EditorImageStore interface {
	UploadFile(ctx context.Context, file multipart.File, key, contentType string) error
	PublicURL(key string) string
}

type UploadService struct {
	store EditorImageStore
}

func NewUploadService(store EditorImageStore) *UploadService {
	return &UploadService{store: store}
}

// UploadEditorImage stores an image dropped into the post editor under a public
// prefix and returns its permanent public URL for the editor to embed as an
// <img src> in the body HTML.
//
// Deliberately NOT tied to a post and NOT recorded in post_images: a new post
// has no id yet at compose time, and inline images live in the body HTML, not
// the gallery. Returns an error when no public URL can be minted
// (R2_PUBLIC_URL unset), since an expiring URL would be unusable here.
func (s *UploadService) UploadEditorImage(ctx context.Context, file multipart.File, header *multipart.FileHeader) (string, error) {
	// Use only the extension from the original filename - never the full name,
	// which can carry spaces, unicode, or "../" path-traversal. The key itself
	// is server-generated, so a client can't choose or overwrite an object.
	ext := filepath.Ext(header.Filename)
	key := fmt.Sprintf("images/body/%d%s", time.Now().UnixNano(), ext)

	contentType := header.Header.Get("Content-Type")
	if err := s.store.UploadFile(ctx, file, key, contentType); err != nil {
		return "", fmt.Errorf("s3 upload: %w", err)
	}

	url := s.store.PublicURL(key)
	if url == "" {
		return "", fmt.Errorf("no public URL configured (R2_PUBLIC_URL); editor images need a permanent URL")
	}
	return url, nil
}
