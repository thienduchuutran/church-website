package service

import (
	"context"
	"fmt"
	"log"
	"mime/multipart"
	"path/filepath"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// ImageStore is the subset of storage.S3Client this service needs.
// Defining our own interface here (rather than importing storage.S3Client
// directly) means this service stays decoupled from the storage package.
// A future test could swap in a fake ImageStore without touching S3 at all.
type ImageStore interface {
	UploadFile(ctx context.Context, file multipart.File, key, contentType string) error
	DeleteFile(ctx context.Context, key string) error
}

// GalleryRepository is the subset of repository.GalleryRepository this service needs.
type GalleryRepository interface {
	InsertPostImage(ctx context.Context, img *model.PostImage) error
	GetMaxDisplayOrder(ctx context.Context, postID string) (int, error)
}

type GalleryService struct {
	store ImageStore
	repo  GalleryRepository
}

func NewGalleryService(store ImageStore, repo GalleryRepository) *GalleryService {
	return &GalleryService{store: store, repo: repo}
}

// AddImageToPost uploads the file to S3 and saves its key to the database.
//
// The two-phase design (S3 first, then DB) means we could end up with a file
// in S3 that has no DB row pointing to it if the DB insert fails. We handle
// this by calling DeleteFile to clean up S3 before returning the error.
// The alternative - DB first - is worse: you'd have a DB row pointing to a
// file that doesn't exist yet, and a failed upload would leave dangling rows.
func (s *GalleryService) AddImageToPost(
	ctx context.Context,
	postID string,
	file multipart.File,
	header *multipart.FileHeader,
) (*model.PostImage, error) {
	// Build the S3 key.
	// We use only the file extension from the original filename - never the full
	// name. User-supplied filenames can contain spaces, unicode, or path
	// traversal sequences like "../../../etc/passwd". Using just the extension
	// keeps the key clean and safe while preserving the file type information.
	ext := filepath.Ext(header.Filename)
	key := fmt.Sprintf("images/posts/%s/%d%s", postID, time.Now().UnixNano(), ext)

	contentType := header.Header.Get("Content-Type")
	if err := s.store.UploadFile(ctx, file, key, contentType); err != nil {
		return nil, fmt.Errorf("s3 upload: %w", err)
	}

	maxOrder, err := s.repo.GetMaxDisplayOrder(ctx, postID)
	if err != nil {
		if cleanupErr := s.store.DeleteFile(ctx, key); cleanupErr != nil {
			log.Printf("AddImageToPost: failed to clean up s3 key %s after get max order error: %v", key, cleanupErr)
		}
		return nil, fmt.Errorf("get max display order: %w", err)
	}

	img := &model.PostImage{
		PostID:       postID,
		StorageKey:   key,
		DisplayOrder: maxOrder + 1,
	}

	if err := s.repo.InsertPostImage(ctx, img); err != nil {
		// DB insert failed after a successful S3 upload.
		// Delete the orphaned S3 object so storage stays consistent with the DB.
		// We log the cleanup result but don't return it - the original DB error
		// is what the caller needs to know about.
		if cleanupErr := s.store.DeleteFile(ctx, key); cleanupErr != nil {
			log.Printf("AddImageToPost: failed to clean up s3 key %s after db error: %v", key, cleanupErr)
		}
		return nil, fmt.Errorf("db insert: %w", err)
	}

	return img, nil
}
