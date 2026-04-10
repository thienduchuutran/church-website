package model

import (
	"errors"
	"fmt"
	"time"
)

// ErrNotFound is returned when a requested resource does not exist.
var ErrNotFound = errors.New("not found")

type PostType string

const (
	PostTypeEvent        PostType = "event"
	PostTypeAnnouncement PostType = "announcement"
	PostTypeBibleStudy   PostType = "bible_study"
	PostTypePlaylist     PostType = "playlist"
	PostTypeGalleryAlbum PostType = "gallery_album"
)

type Post struct {
	ID           string          `json:"id"`
	Type         PostType        `json:"type"`
	Title        string          `json:"title"`
	Body         *string         `json:"body"`
	EventDate    *time.Time      `json:"event_date"`
	ExternalLink *string         `json:"external_link"`
	AdminID      *string         `json:"admin_id"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	Images       []PostImage     `json:"images,omitempty"`
	Reactions    []ReactionCount `json:"reactions,omitempty"`
}

type PostImage struct {
	ID           string `json:"id"`
	PostID       string `json:"post_id"`
	StorageURL   string `json:"storage_url"`
	DisplayOrder int    `json:"display_order"`
}

type Reaction struct {
	ID          string `json:"id"`
	PostID      string `json:"post_id"`
	Emoji       string `json:"emoji"`
	Fingerprint string `json:"fingerprint"`
}

type ReactionCount struct {
	Emoji string `json:"emoji"`
	Count int    `json:"count"`
}

// ReactionSummary is the response shape for GET /api/v1/reactions/{post_id}.
// MyReaction is nil when no fingerprint was provided or no reaction exists for that fingerprint.
type ReactionSummary struct {
	Counts     []ReactionCount `json:"counts"`
	MyReaction *string         `json:"my_reaction"`
}

type Admin struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName *string   `json:"display_name"`
	CreatedAt   time.Time `json:"created_at"`
}

// --- Request types ---

type CreatePostRequest struct {
	Type         PostType   `json:"type"`
	Title        string     `json:"title"`
	Body         *string    `json:"body"`
	EventDate    *time.Time `json:"event_date"`
	ExternalLink *string    `json:"external_link"`
}

// Validate checks required fields and type-specific constraints.
func (r *CreatePostRequest) Validate() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	switch r.Type {
	case PostTypeEvent, PostTypeAnnouncement, PostTypeBibleStudy, PostTypePlaylist, PostTypeGalleryAlbum:
	default:
		return fmt.Errorf("invalid post type: %s", r.Type)
	}
	if r.Type == PostTypeEvent && r.EventDate == nil {
		return errors.New("event_date is required for events")
	}
	return nil
}

type UpdatePostRequest struct {
	Title        *string    `json:"title"`
	Body         *string    `json:"body"`
	EventDate    *time.Time `json:"event_date"`
	ExternalLink *string    `json:"external_link"`
}

type CreateReactionRequest struct {
	PostID      string `json:"post_id"`
	Emoji       string `json:"emoji"`
	Fingerprint string `json:"fingerprint"`
}

type CreateAlbumRequest struct {
	Title        string               `json:"title"`
	Body         *string              `json:"body"`
	ExternalLink *string              `json:"external_link"`
	Images       []CreateImageRequest `json:"images"`
}

type CreateImageRequest struct {
	StorageURL   string `json:"storage_url"`
	DisplayOrder int    `json:"display_order"`
}

// --- Page content types ---

// PageContent represents a single editable section on a static page (about, connect).
type PageContent struct {
	ID         string    `json:"id"`
	PageSlug   string    `json:"page_slug"`
	SectionKey string    `json:"section_key"`
	Content    string    `json:"content"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// UpdatePageRequest is the request body for PUT /api/v1/pages/:slug.
type UpdatePageRequest struct {
	Sections map[string]string `json:"sections"`
}
