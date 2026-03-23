package model

import (
	"errors"
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
