package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/discord"
	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
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

// presignTTL is how long each presigned URL stays valid. It needs to outlive
// Next.js's revalidate window (60s) by a comfortable margin so the URL doesn't
// expire mid-render or right after the page finishes streaming. One hour is a
// conservative choice - long enough for any reasonable read path, short enough
// to limit the blast radius if a URL leaks.
const presignTTL = 1 * time.Hour

type PostService struct {
	posts     *repository.PostRepository
	images    PostImageRepo // optional - nil-safe; when nil, posts are returned without images
	presigner URLPresigner  // optional - nil-safe; when nil, images carry only storage_key
}

// NewPostService builds a post service. Both `images` and `presigner` may be nil
// - the service degrades gracefully so the API still serves text-only posts on
// environments where S3 is not configured.
func NewPostService(posts *repository.PostRepository, images PostImageRepo, presigner URLPresigner) *PostService {
	return &PostService{posts: posts, images: images, presigner: presigner}
}

// Create validates the request, persists the post, and fires a Discord notification.
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

	return post, nil
}

func (s *PostService) List(ctx context.Context, postType *model.PostType, limit, offset int) ([]model.Post, error) {
	posts, err := s.posts.GetPosts(ctx, postType, limit, offset)
	if err != nil {
		return nil, err
	}
	if err := s.attachImages(ctx, posts); err != nil {
		// Image enrichment is best-effort: if it fails we still return posts so
		// text content stays visible. The error is logged for observability.
		log.Printf("attachImages: %v", err)
	}
	return posts, nil
}

func (s *PostService) Get(ctx context.Context, id string) (*model.Post, error) {
	post, err := s.posts.GetPostByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// attachImages mutates the slice in-place; pass a length-1 slice and copy the
	// populated Images field back onto the pointer the caller is holding.
	enriched := []model.Post{*post}
	if err := s.attachImages(ctx, enriched); err != nil {
		log.Printf("attachImages: %v", err)
		return post, nil
	}
	post.Images = enriched[0].Images
	return post, nil
}

func (s *PostService) Update(ctx context.Context, id string, req model.UpdatePostRequest) (*model.Post, error) {
	return s.posts.UpdatePost(ctx, id, req)
}

func (s *PostService) Delete(ctx context.Context, id string) error {
	return s.posts.DeletePost(ctx, id)
}

// attachImages fills Post.Images for each post in-place, presigning URLs when
// a presigner is available. It batches by post id so listing N posts costs one
// SELECT instead of N. Safe to call when the gallery repo or presigner are nil
// - those branches skip enrichment without erroring.
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
		if s.presigner != nil {
			for j := range imgs {
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
