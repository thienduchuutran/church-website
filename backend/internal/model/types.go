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
	StorageKey   string `json:"storage_key"`
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
	StorageKey   string `json:"storage_key"`
	DisplayOrder int    `json:"display_order"`
}

// --- Calendar types ---

type CalendarEventType string

const (
	CalendarEventTypeBirthday     CalendarEventType = "birthday"
	CalendarEventTypeBibleStudy   CalendarEventType = "bible_study"
	CalendarEventTypeGeneral      CalendarEventType = "general"
	CalendarEventTypeAnnouncement CalendarEventType = "announcement"
	CalendarEventTypePrayer       CalendarEventType = "prayer"
)

// AllowedCalendarIcons is the curated Phosphor icon key set admins may choose from.
var AllowedCalendarIcons = map[string]bool{
	"cake": true, "book-open": true, "bell": true, "heart": true, "star": true,
	"users": true, "music-notes": true, "cross": true, "flame": true, "sparkle": true,
}

// AllowedCalendarColors is the editorial palette admins may choose from.
var AllowedCalendarColors = map[string]bool{
	"slate": true, "red": true, "amber": true, "emerald": true,
	"sky": true, "violet": true, "rose": true, "stone": true,
}

type CalendarEvent struct {
	ID        string            `json:"id"`
	Date      string            `json:"date"` // YYYY-MM-DD
	Title     string            `json:"title"`
	EventType CalendarEventType `json:"event_type"`
	Icon      string            `json:"icon"`
	Color     string            `json:"color"`
	Notes     *string           `json:"notes"`
	AdminID   *string           `json:"admin_id"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
}

type CalendarMonthNote struct {
	ID        string    `json:"id"`
	Year      int       `json:"year"`
	Month     int       `json:"month"`
	Content   string    `json:"content"`
	AdminID   *string   `json:"admin_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CalendarMonthResponse struct {
	Events    []CalendarEvent    `json:"events"`
	MonthNote *CalendarMonthNote `json:"month_note"`
}

type CreateCalendarEventRequest struct {
	Date      string            `json:"date"`
	Title     string            `json:"title"`
	EventType CalendarEventType `json:"event_type"`
	Icon      string            `json:"icon"`
	Color     string            `json:"color"`
	Notes     *string           `json:"notes"`
}

func (r *CreateCalendarEventRequest) Validate() error {
	if r.Date == "" {
		return errors.New("date is required")
	}
	if r.Title == "" {
		return errors.New("title is required")
	}
	switch r.EventType {
	case CalendarEventTypeBirthday, CalendarEventTypeBibleStudy,
		CalendarEventTypeGeneral, CalendarEventTypeAnnouncement, CalendarEventTypePrayer:
	default:
		return fmt.Errorf("invalid event_type: %s", r.EventType)
	}
	if !AllowedCalendarIcons[r.Icon] {
		return fmt.Errorf("invalid icon: %s", r.Icon)
	}
	if !AllowedCalendarColors[r.Color] {
		return fmt.Errorf("invalid color: %s", r.Color)
	}
	return nil
}

type UpdateCalendarEventRequest struct {
	Date      *string            `json:"date"`
	Title     *string            `json:"title"`
	EventType *CalendarEventType `json:"event_type"`
	Icon      *string            `json:"icon"`
	Color     *string            `json:"color"`
	Notes     *string            `json:"notes"`
}

func (r *UpdateCalendarEventRequest) Validate() error {
	if r.EventType != nil {
		switch *r.EventType {
		case CalendarEventTypeBirthday, CalendarEventTypeBibleStudy,
			CalendarEventTypeGeneral, CalendarEventTypeAnnouncement, CalendarEventTypePrayer:
		default:
			return fmt.Errorf("invalid event_type: %s", *r.EventType)
		}
	}
	if r.Icon != nil && !AllowedCalendarIcons[*r.Icon] {
		return fmt.Errorf("invalid icon: %s", *r.Icon)
	}
	if r.Color != nil && !AllowedCalendarColors[*r.Color] {
		return fmt.Errorf("invalid color: %s", *r.Color)
	}
	return nil
}

type UpsertMonthNoteRequest struct {
	Content string `json:"content"`
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
