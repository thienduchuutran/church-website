package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/discord"
	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/translation"
)

// PostImageRepo is the subset of the gallery repository PostService needs to
// hydrate posts with their images. Defined as an interface so PostService stays
// decoupled from the concrete repository and so tests can swap in a fake.
type PostImageRepo interface {
	GetImagesByPostIDs(ctx context.Context, postIDs []string) (map[string][]model.PostImage, error)
}

// URLPresigner returns a short-lived URL for an S3 object key. PostService uses
// it to attach a `storage_url` field to each PostImage so the frontend can
// render private S3 objects without ever touching AWS credentials directly.
// The interface exists (rather than importing storage.S3Client) so PostService
// stays decoupled from the storage layer and so a fake can be swapped in for tests.
type URLPresigner interface {
	PresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error)
}

// PublicURLBuilder returns a permanent direct URL for objects living in a
// public bucket/prefix. Used for gallery_album images so the frontend gets
// stable, CDN-cacheable URLs instead of URLs that rotate every hour.
// Separate from URLPresigner because hero_video and non-gallery posts still
// need presigning - the two responsibilities should not be conflated in any
// single interface.
type PublicURLBuilder interface {
	PublicURL(key string) string
}

// presignTTL is how long each presigned URL stays valid. It needs to outlive
// Next.js's revalidate window (60s) by a comfortable margin so the URL doesn't
// expire mid-render or right after the page finishes streaming. One hour is a
// conservative choice - long enough for any reasonable read path, short enough
// to limit the blast radius if a URL leaks.
const presignTTL = 1 * time.Hour

type PostService struct {
	posts      *repository.PostRepository
	images     PostImageRepo            // optional - nil-safe; when nil, posts are returned without images
	presigner  URLPresigner             // optional - nil-safe; when nil, non-gallery images carry only storage_key
	publicURLs PublicURLBuilder         // optional - nil-safe; when nil, gallery images fall back to presigning
	tags       *repository.TagRepository // optional - nil-safe; when nil, gallery posts have no tags
	enqueue    translation.EnqueueFn    // optional - nil-safe; when nil, no translation jobs are fired
}

// NewPostService builds a post service. `images`, `presigner`, `publicURLs`, and `tags`
// may each be nil - the service degrades gracefully so the API still serves
// text-only posts on environments where S3 is not configured, and falls back
// to presigning for gallery images when the public bucket URL is not set.
func NewPostService(posts *repository.PostRepository, images PostImageRepo, presigner URLPresigner, publicURLs PublicURLBuilder) *PostService {
	return &PostService{posts: posts, images: images, presigner: presigner, publicURLs: publicURLs}
}

// SetTagRepository wires the tag repository into the post service. This is a separate method
// because tags are loaded lazily in attachTags - the service degrades gracefully if no
// tag repository is set (gallery posts just have no Tags field populated).
func (s *PostService) SetTagRepository(tags *repository.TagRepository) {
	s.tags = tags
}

// SetTranslationQueue wires the async translation enqueuer. Same pattern as
// SetTagRepository - separate setter so a fresh dev environment with no AI
// keys keeps the post service working; translation is opt-in.
func (s *PostService) SetTranslationQueue(enqueue translation.EnqueueFn) {
	s.enqueue = enqueue
}

// Create validates the request, persists the post, and fires two side effects:
// a Discord webhook (existing behavior) and a translation job (new). Both run
// in goroutines so the handler returns to the client immediately.
func (s *PostService) Create(ctx context.Context, req model.CreatePostRequest, userID string) (*model.Post, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}

	post := &model.Post{
		Type:         req.Type,
		Title:        req.Title,
		Body:         req.Body,
		EventDate:    req.EventDate,
		ExternalLink: req.ExternalLink,
		AdminID:      &userID,
	}

	if err := s.posts.InsertPost(ctx, post); err != nil {
		return nil, fmt.Errorf("insert: %w", err)
	}

	go func() {
		if err := discord.SendToDiscord(*post); err != nil {
			log.Printf("discord webhook error for post %s: %v", post.ID, err)
		}
	}()

	s.fireTranslation(post.ID, post.Title, post.Body)

	return post, nil
}

func (s *PostService) List(ctx context.Context, postType *model.PostType, tagIDs []string, limit, offset int, locale string) ([]model.Post, error) {
	posts, err := s.posts.GetPosts(ctx, postType, tagIDs, limit, offset, locale)
	if err != nil {
		return nil, err
	}
	if err := s.attachImages(ctx, posts); err != nil {
		// Image enrichment is best-effort: if it fails we still return posts so
		// text content stays visible. The error is logged for observability.
		log.Printf("attachImages: %v", err)
	}
	if err := s.attachTags(ctx, posts); err != nil {
		log.Printf("attachTags: %v", err)
	}
	return posts, nil
}

func (s *PostService) Get(ctx context.Context, id, locale string) (*model.Post, error) {
	post, err := s.posts.GetPostByID(ctx, id, locale)
	if err != nil {
		return nil, err
	}
	// attachImages and attachTags mutate the slice in-place; pass a length-1 slice and copy the
	// populated fields back onto the pointer the caller is holding.
	enriched := []model.Post{*post}
	if err := s.attachImages(ctx, enriched); err != nil {
		log.Printf("attachImages: %v", err)
	}
	if err := s.attachTags(ctx, enriched); err != nil {
		log.Printf("attachTags: %v", err)
	}
	post.Images = enriched[0].Images
	post.Tags = enriched[0].Tags
	return post, nil
}

// Update fetches the existing post, applies the patch, then enqueues
// translation only for fields that actually changed. The diff matters
// because a PATCH with the same title should not re-fire a translation
// job, even though the cache lookup would absorb the cost - silence in
// logs is worth the extra read.
func (s *PostService) Update(ctx context.Context, id string, req model.UpdatePostRequest) (*model.Post, error) {
	existing, err := s.posts.GetPostByID(ctx, id, "")
	if err != nil {
		return nil, err
	}

	updated, err := s.posts.UpdatePost(ctx, id, req)
	if err != nil {
		return nil, err
	}

	changedFields := map[string]string{}
	if req.Title != nil && *req.Title != existing.Title {
		changedFields["title"] = updated.Title
	}
	if req.Body != nil && !stringPtrEqual(req.Body, existing.Body) {
		if updated.Body != nil {
			changedFields["body"] = *updated.Body
		}
	}
	if len(changedFields) > 0 {
		s.enqueueFields(updated.ID, changedFields)
	}

	return updated, nil
}

func (s *PostService) Delete(ctx context.Context, id string) error {
	return s.posts.DeletePost(ctx, id)
}

// fireTranslation enqueues a job for the title/body of a freshly-created post.
// Nil-safe: bails when no body and no title (shouldn't happen since title is
// required, but defensive) or when no enqueue function is wired.
func (s *PostService) fireTranslation(postID, title string, body *string) {
	fields := map[string]string{}
	if title != "" {
		fields["title"] = title
	}
	if body != nil && *body != "" {
		fields["body"] = *body
	}
	s.enqueueFields(postID, fields)
}

func (s *PostService) enqueueFields(postID string, fields map[string]string) {
	if s.enqueue == nil || len(fields) == 0 {
		return
	}
	s.enqueue(translation.TranslationJob{
		TableName:     "posts",
		RecordID:      postID,
		Fields:        fields,
		TargetLocales: []string{"vi"},
		ContentType:   translation.ContentTypeGeneral,
	})
}

func stringPtrEqual(a, b *string) bool {
	switch {
	case a == nil && b == nil:
		return true
	case a == nil || b == nil:
		return false
	default:
		return *a == *b
	}
}

// attachImages fills Post.Images for each post in-place. Gallery_album images
// get permanent public URLs (the gallery R2 prefix is public, so no presigning
// is needed and the frontend can cache them via Cloudflare's CDN). Every other
// post type gets a short-lived presigned URL. Both paths fall back gracefully
// when their respective dependencies are nil. Batches by post id so listing N
// posts costs one SELECT instead of N.
func (s *PostService) attachImages(ctx context.Context, posts []model.Post) error {
	if s.images == nil || len(posts) == 0 {
		return nil
	}

	ids := make([]string, len(posts))
	for i, p := range posts {
		ids[i] = p.ID
	}

	imagesByPost, err := s.images.GetImagesByPostIDs(ctx, ids)
	if err != nil {
		return fmt.Errorf("get images: %w", err)
	}

	for i := range posts {
		imgs := imagesByPost[posts[i].ID]
		isGallery := posts[i].Type == model.PostTypeGalleryAlbum
		for j := range imgs {
			if isGallery && s.publicURLs != nil {
				if url := s.publicURLs.PublicURL(imgs[j].StorageKey); url != "" {
					imgs[j].StorageURL = url
					continue
				}
				// Public URL unavailable (R2_PUBLIC_URL not set) - fall through
				// to presigning so the image still renders.
			}
			if s.presigner != nil {
				url, err := s.presigner.PresignedURL(ctx, imgs[j].StorageKey, presignTTL)
				if err != nil {
					// One failed presign should not blank out the whole feed -
					// leave storage_url empty so the frontend can fall back to a
					// placeholder while still rendering the rest of the post.
					log.Printf("presign %s: %v", imgs[j].StorageKey, err)
					continue
				}
				imgs[j].StorageURL = url
			}
		}
		posts[i].Images = imgs
	}
	return nil
}

// attachTags fills Post.Tags for gallery_album posts in-place. Non-gallery posts
// are left with empty Tags. Safe to call when the tag repo is nil - those posts
// just stay without tags.
func (s *PostService) attachTags(ctx context.Context, posts []model.Post) error {
	if s.tags == nil || len(posts) == 0 {
		return nil
	}

	for i := range posts {
		if posts[i].Type != model.PostTypeGalleryAlbum {
			continue
		}
		tags, err := s.tags.GetTagsByPostID(ctx, posts[i].ID)
		if err != nil {
			log.Printf("get tags for post %s: %v", posts[i].ID, err)
			continue
		}
		posts[i].Tags = tags
	}
	return nil
}
