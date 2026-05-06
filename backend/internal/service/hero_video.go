package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"mime/multipart"
	"path/filepath"
	"sync"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// heroVideoPresignTTL is how long a presigned URL for the hero video stays valid.
// 24 hours is safe for a background video that loads once per page view - much
// longer than a typical browser session, yet short enough to limit the blast
// radius if a URL leaks.
const heroVideoPresignTTL = 24 * time.Hour

// cacheExpiry is how long we cache the active hero video in-memory before
// refreshing from the database. 5 minutes balances freshness (new uploads appear
// quickly) with reducing database load.
const cacheExpiry = 5 * time.Minute

// VideoStore is the subset of storage.S3Client HeroVideoService needs.
// Defined locally so the service is decoupled from the storage package and
// testable with a fake - the real S3Client satisfies it via structural typing.
type VideoStore interface {
	UploadFile(ctx context.Context, file multipart.File, key, contentType string) error
	DeleteFile(ctx context.Context, key string) error
}

// HeroVideoRepo is the subset of repository.HeroVideoRepository this service needs.
type HeroVideoRepo interface {
	DeactivateAll(ctx context.Context) error
	InsertHeroVideo(ctx context.Context, v *model.HeroVideo) error
	GetActiveHeroVideo(ctx context.Context) (*model.HeroVideo, error)
	SetVisibility(ctx context.Context, visible bool) error
}

type HeroVideoService struct {
	store     VideoStore
	repo      HeroVideoRepo
	presigner URLPresigner // optional - nil-safe; when nil, video_url is omitted from responses

	// In-memory cache for GetActiveHeroVideo. Protects against database hammering
	// when the homepage is popular.
	cacheMu    sync.Mutex
	cachedVideo *model.HeroVideo
	cacheTime  time.Time
}

func NewHeroVideoService(store VideoStore, repo HeroVideoRepo, presigner URLPresigner) *HeroVideoService {
	return &HeroVideoService{store: store, repo: repo, presigner: presigner}
}

// UploadHeroVideo validates the file, uploads it to S3, deactivates the previous
// active video, then inserts the new DB row. S3 is cleaned up if any DB step fails.
//
// Order is intentional:
//
//	S3 first  - if S3 fails, the DB is untouched (no orphan rows, no deactivation).
//	Deactivate second - only runs after S3 succeeds.
//	Insert last - if it fails, the uploaded S3 object is deleted before returning.
//
// This is the same pattern as GalleryService.AddImageToPost.
func (s *HeroVideoService) UploadHeroVideo(
	ctx context.Context,
	file multipart.File,
	header *multipart.FileHeader,
	uploadedBy *string,
) (*model.HeroVideo, error) {
	contentType := header.Header.Get("Content-Type")
	if !model.AllowedVideoContentTypes[contentType] {
		return nil, fmt.Errorf("unsupported file type %q. Please use mp4, webm, or mov", contentType)
	}

	// header.Size is the declared size from the multipart part header. It is a
	// best-effort semantic check; the hard network cap (MaxBytesReader) is set
	// by the handler before this method is ever called.
	if header.Size > model.MaxHeroVideoBytes {
		return nil, fmt.Errorf("file too large: %d bytes (max %d)", header.Size, model.MaxHeroVideoBytes)
	}

	// Use only the extension from the original filename - never the full name.
	// User-supplied filenames can contain spaces, unicode, or path traversal
	// sequences like "../../../etc/passwd". Extension preserves the MIME hint
	// for S3 content negotiation without any of the risk.
	ext := filepath.Ext(header.Filename)
	key := fmt.Sprintf("videos/hero/%d%s", time.Now().UnixNano(), ext)

	if err := s.store.UploadFile(ctx, file, key, contentType); err != nil {
		return nil, fmt.Errorf("s3 upload: %w", err)
	}

	// S3 succeeded. Any failure below must clean up the uploaded object so
	// storage stays consistent with the database.
	size := header.Size
	v := &model.HeroVideo{
		StorageKey:  key,
		FileName:    header.Filename,
		FileSize:    &size,
		ContentType: &contentType,
		UploadedBy:  uploadedBy,
	}

	if err := s.repo.DeactivateAll(ctx); err != nil {
		if cleanupErr := s.store.DeleteFile(ctx, key); cleanupErr != nil {
			log.Printf("UploadHeroVideo: s3 cleanup failed after DeactivateAll error (key=%s): %v", key, cleanupErr)
		}
		return nil, fmt.Errorf("deactivate existing: %w", err)
	}

	if err := s.repo.InsertHeroVideo(ctx, v); err != nil {
		if cleanupErr := s.store.DeleteFile(ctx, key); cleanupErr != nil {
			log.Printf("UploadHeroVideo: s3 cleanup failed after db insert error (key=%s): %v", key, cleanupErr)
		}
		return nil, fmt.Errorf("db insert: %w", err)
	}

	// Invalidate the cache so GetActiveHeroVideo picks up the new video immediately.
	s.cacheMu.Lock()
	s.cachedVideo = nil
	s.cacheMu.Unlock()

	return v, nil
}

// SetHeroVideoVisibility toggles whether the active video is shown on the homepage.
// Busts the in-memory cache so the change is visible to visitors on the next request.
func (s *HeroVideoService) SetHeroVideoVisibility(ctx context.Context, visible bool) error {
	if err := s.repo.SetVisibility(ctx, visible); err != nil {
		return err
	}
	s.cacheMu.Lock()
	s.cachedVideo = nil
	s.cacheMu.Unlock()
	return nil
}

// GetActiveHeroVideo returns the current hero video with a presigned URL attached.
// The result is cached for 5 minutes to reduce database load on popular pages.
// Returns nil, nil when no video has been uploaded yet - this is not an error,
// it is a valid initial state. The handler sends {"video":null} and the frontend
// shows its fallback image.
func (s *HeroVideoService) GetActiveHeroVideo(ctx context.Context) (*model.HeroVideo, error) {
	s.cacheMu.Lock()
	if s.cachedVideo != nil && time.Since(s.cacheTime) < cacheExpiry {
		defer s.cacheMu.Unlock()
		return s.cachedVideo, nil
	}
	s.cacheMu.Unlock()

	v, err := s.repo.GetActiveHeroVideo(ctx)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}

	if s.presigner != nil {
		url, err := s.presigner.PresignedURL(ctx, v.StorageKey, heroVideoPresignTTL)
		if err != nil {
			// A failed presign should not prevent the endpoint from responding.
			// Leave VideoURL empty; the frontend falls back to its placeholder.
			log.Printf("GetActiveHeroVideo: presign %s: %v", v.StorageKey, err)
		} else {
			v.VideoURL = url
		}
	}

	s.cacheMu.Lock()
	s.cachedVideo = v
	s.cacheTime = time.Now()
	s.cacheMu.Unlock()

	return v, nil
}
