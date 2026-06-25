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

// AdminLookup resolves the admin who wrote a post (by their email, which is on
// the request context) so the Discord message can be posted under that admin's
// own linked Discord identity. An interface so PostService stays decoupled from
// the admin repository and so a fake can be swapped in for tests; nil-safe, so
// posting still works when no lookup is wired (falls back to default identity).
type AdminLookup interface {
	GetByEmail(ctx context.Context, email string) (*model.Admin, error)
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
	admins     AdminLookup              // optional - nil-safe; when nil, Discord posts use default identity
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

// SetAdminLookup wires the admin resolver used to post Discord messages under
// the writing admin's own Discord identity. Same opt-in pattern as the other
// setters: without it, Discord posts fall back to the default church identity.
func (s *PostService) SetAdminLookup(admins AdminLookup) {
	s.admins = admins
}

// Create validates the request, persists the post, and fires two side effects:
// a Discord message (under the writing admin's identity) and a translation job.
// Both run in goroutines so the handler returns to the client immediately, and
// both are best-effort - a failure logs but never fails the create.
func (s *PostService) Create(ctx context.Context, req model.CreatePostRequest, userID, adminEmail string) (*model.Post, error) {
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

	// Detached goroutine: it must outlive the request, so it resolves identity
	// and writes the message id back using its own background context rather
	// than ctx (which is cancelled the moment Create returns).
	go s.dispatchDiscordCreate(*post, adminEmail, req.NotifyEveryone)

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

	// Mirror the edit to Discord (best-effort). Identity stays as originally
	// sent - Discord ignores username/avatar on edit - so we only update text.
	go s.dispatchDiscordEdit(*updated)

	return updated, nil
}

// SetArchived moves an event between the Upcoming and Past sections by toggling
// its archived_at flag. Unlike Create/Update it fires no Discord side effect:
// archiving only changes how the website groups the event, not the content of
// the Discord message that was already sent.
func (s *PostService) SetArchived(ctx context.Context, id string, archived bool) (*model.Post, error) {
	return s.posts.SetArchived(ctx, id, archived)
}

func (s *PostService) Delete(ctx context.Context, id string) error {
	// Read the Discord ref BEFORE deleting the row - afterwards the message id
	// and channel key are gone. Read failure is non-fatal: we just skip the
	// Discord delete (best-effort) and still remove the post.
	messageID, channelKey, refErr := s.posts.GetDiscordRef(ctx, id)

	if err := s.posts.DeletePost(ctx, id); err != nil {
		return err
	}

	if refErr == nil && messageID != nil && channelKey != nil {
		go s.dispatchDiscordDelete(*messageID, *channelKey)
	}
	return nil
}

// discordSideEffectTimeout bounds each detached Discord delivery goroutine
// (resolve identity + HTTP call + persist message id). Generous enough for a
// slow Discord, short enough that a stall cannot leak goroutines forever.
const discordSideEffectTimeout = 15 * time.Second

// dispatchDiscordCreate posts a freshly-created post to its channel under the
// writing admin's Discord identity, then records the returned message id +
// channel key so a later edit/delete targets the same message. Best-effort:
// every failure path logs and returns; none of them can fail the user's create
// (the post is already saved). Runs in its own goroutine with a background
// context because the request context is gone by the time this executes.
func (s *PostService) dispatchDiscordCreate(post model.Post, adminEmail string, notifyEveryone bool) {
	url, envKey, ok := discord.WebhookForType(post.Type)
	if !ok {
		log.Printf("discord: no webhook configured for post %s (type %s)", post.ID, post.Type)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), discordSideEffectTimeout)
	defer cancel()

	msg := s.buildOutbound(post, notifyEveryone)
	identity := s.identityFor(ctx, adminEmail)
	msg.Username = identity.Username
	msg.AvatarURL = identity.AvatarURL

	messageID, err := discord.Send(url, msg)
	if err != nil {
		log.Printf("discord: send failed for post %s: %v", post.ID, err)
		return
	}
	if err := s.posts.SetDiscordMessage(ctx, post.ID, messageID, envKey); err != nil {
		log.Printf("discord: persist message id for post %s: %v", post.ID, err)
	}
}

// dispatchDiscordEdit updates the Discord message a post was delivered as.
// No-op when the post was never sent to Discord. Identity is omitted (Discord
// ignores it on edit). Best-effort: logs and returns on any failure.
func (s *PostService) dispatchDiscordEdit(post model.Post) {
	ctx, cancel := context.WithTimeout(context.Background(), discordSideEffectTimeout)
	defer cancel()

	messageID, channelKey, err := s.posts.GetDiscordRef(ctx, post.ID)
	if err != nil || messageID == nil || channelKey == nil {
		return // never delivered to Discord - nothing to edit
	}
	url, ok := discord.WebhookByKey(*channelKey)
	if !ok {
		log.Printf("discord: webhook env %q for post %s is unset; skipping edit", *channelKey, post.ID)
		return
	}
	// NotifyEveryone is a create-time choice only; an edit never re-pings.
	if err := discord.Edit(url, *messageID, s.buildOutbound(post, false)); err != nil {
		log.Printf("discord: edit failed for post %s: %v", post.ID, err)
	}
}

// dispatchDiscordDelete removes the Discord message a deleted post was
// delivered as. Best-effort: logs and returns on failure.
func (s *PostService) dispatchDiscordDelete(messageID, channelKey string) {
	url, ok := discord.WebhookByKey(channelKey)
	if !ok {
		log.Printf("discord: webhook env %q is unset; skipping delete of message %s", channelKey, messageID)
		return
	}
	if err := discord.Delete(url, messageID); err != nil {
		log.Printf("discord: delete failed for message %s: %v", messageID, err)
	}
}

// buildOutbound renders a post into a Discord message. A NotifyEveryone post
// gets the "@everyone " prefix AND the matching allowed_mentions; otherwise the
// default suppresses every mention so stray @everyone text in the body is inert.
func (s *PostService) buildOutbound(post model.Post, notifyEveryone bool) discord.OutboundMessage {
	content := discord.BuildContent(post)
	mentions := discord.NoMentions()
	if notifyEveryone {
		content = "@everyone " + content
		mentions = discord.EveryoneMention()
	}
	return discord.OutboundMessage{Content: content, AllowedMentions: mentions}
}

// identityFor resolves the Discord sender for the admin with this email. Falls
// back to the default identity when no lookup is wired, the email is empty, or
// the admin can't be loaded - so an unlinked admin (or a misconfigured lookup)
// still posts.
func (s *PostService) identityFor(ctx context.Context, email string) discord.SenderIdentity {
	if s.admins == nil || email == "" {
		return discord.IdentityForAdmin(nil)
	}
	admin, err := s.admins.GetByEmail(ctx, email)
	if err != nil {
		log.Printf("discord: resolve admin %q: %v", email, err)
		return discord.IdentityForAdmin(nil)
	}
	return discord.IdentityForAdmin(admin)
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
