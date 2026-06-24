package model

import (
	"errors"
	"fmt"
	"regexp"
	"time"
)

// hexColorRegexp matches a 6-digit RGB hex color like "#C4663C". Used by the
// month-settings request to keep the database column from accepting arbitrary
// strings (e.g. CSS keywords, malformed values) the frontend can't render safely.
var hexColorRegexp = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

// ErrNotFound is returned when a requested resource does not exist.
var ErrNotFound = errors.New("not found")

// ErrAlreadyExists is returned when a unique constraint is violated.
var ErrAlreadyExists = errors.New("already exists")

type PostType string

const (
	PostTypeEvent        PostType = "event"
	PostTypeAnnouncement PostType = "announcement"
	PostTypeBibleStudy   PostType = "bible_study"
	PostTypePlaylist     PostType = "playlist"
	PostTypeGalleryAlbum PostType = "gallery_album"
)

// Tag represents a reusable label for gallery albums.
type Tag struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	CreatedBy *string   `json:"created_by,omitempty"`
}

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
	Tags         []Tag           `json:"tags,omitempty"`
	// MachineTranslated is true when the response is in a non-English locale
	// AND at least one rendered field was served from translations (rather
	// than the English source) AND that translation has not been human-approved.
	// The frontend reads this to render the subtle "Bản dịch tự động" badge.
	// Omitted when the request locale is English (no translation involved).
	MachineTranslated bool `json:"machine_translated,omitempty"`
}

type PostImage struct {
	ID           string `json:"id"`
	PostID       string `json:"post_id"`
	StorageKey   string `json:"storage_key"`
	DisplayOrder int    `json:"display_order"`
	// StorageURL is a short-lived presigned S3 URL the frontend uses to fetch the image.
	// It is generated on each list/get request and is omitted when no presigner is configured
	// (e.g. the backend started without S3 credentials, in which case images cannot render).
	StorageURL string `json:"storage_url,omitempty"`
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
	// Discord identity, filled by the one-time "Link Discord" OAuth flow. All
	// nullable: an admin who never links still posts, falling back to
	// DisplayName + a default church avatar (see discord.IdentityForAdmin).
	DiscordUserID    *string   `json:"discord_user_id"`
	DiscordUsername  *string   `json:"discord_username"`
	DiscordAvatarURL *string   `json:"discord_avatar_url"`
	CreatedAt        time.Time `json:"created_at"`
}

// --- Request types ---

type CreatePostRequest struct {
	Type         PostType   `json:"type"`
	Title        string     `json:"title"`
	Body         *string    `json:"body"`
	EventDate    *time.Time `json:"event_date"`
	ExternalLink *string    `json:"external_link"`
	// NotifyEveryone opts this one post's Discord message into pinging
	// @everyone. Default false so a normal post never notifies the whole
	// server. Not persisted - it only affects the create-time send.
	NotifyEveryone bool `json:"notify_everyone"`
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
	Icon           string            `json:"icon"`
	PrivateAddress *string           `json:"private_address,omitempty"`
	Color          string            `json:"color"`
	Notes     *string           `json:"notes"`
	AdminID   *string           `json:"admin_id"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
	// MachineTranslated: see Post.MachineTranslated. True when this event's
	// title or notes were served via an unapproved AI translation. Omitted
	// from JSON on English responses and on approved translations.
	MachineTranslated bool `json:"machine_translated,omitempty"`
}

type CalendarMonthNote struct {
	ID        string    `json:"id"`
	Year      int       `json:"year"`
	Month     int       `json:"month"`
	Content   string    `json:"content"`
	AdminID   *string   `json:"admin_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// MachineTranslated: true when this month note's content was served via
	// an unapproved AI translation. Omitted on English responses.
	MachineTranslated bool `json:"machine_translated,omitempty"`
}

// CalendarMonthSettings is the per-month admin-configurable styling for the
// interactive calendar. Currently just an accent color, but the table is the
// natural home for any future month-scoped admin overrides (banner image,
// custom subtitle, etc.) - keep the JSON shape stable.
type CalendarMonthSettings struct {
	ID          string    `json:"id"`
	Year        int       `json:"year"`
	Month       int       `json:"month"`
	AccentColor string    `json:"accent_color"`
	AdminID     *string   `json:"admin_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CalendarMonthResponse struct {
	Events        []CalendarEvent        `json:"events"`
	MonthNote     *CalendarMonthNote     `json:"month_note"`
	MonthSettings *CalendarMonthSettings `json:"month_settings"`
}

type CreateCalendarEventRequest struct {
	Date           string            `json:"date"`
	Title          string            `json:"title"`
	EventType      CalendarEventType `json:"event_type"`
	Icon           string            `json:"icon"`
	PrivateAddress *string           `json:"private_address"`
	Color          string            `json:"color"`
	Notes          *string           `json:"notes"`
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
	Date           *string            `json:"date"`
	Title          *string            `json:"title"`
	EventType      *CalendarEventType `json:"event_type"`
	Icon           *string            `json:"icon"`
	PrivateAddress *string            `json:"private_address"`
	Color          *string            `json:"color"`
	Notes          *string            `json:"notes"`
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

type UpsertMonthSettingsRequest struct {
	AccentColor string `json:"accent_color"`
}

func (r *UpsertMonthSettingsRequest) Validate() error {
	if !hexColorRegexp.MatchString(r.AccentColor) {
		return errors.New("accent_color must be a valid hex color e.g. #C4663C")
	}
	return nil
}

// --- Hero video types ---

// MaxHeroVideoBytes is the raw upload ceiling the handler enforces before
// passing the file to the service for transcoding. 200 MB accommodates iPhone 4K
// 30-sec clips (150-200 MB uncompressed); Phase 2 transcoding reduces to ≤ 10 MB.
const MaxHeroVideoBytes = 200 << 20 // 200 MB

// AllowedVideoContentTypes is the set of MIME types accepted at the upload
// endpoint. video/quicktime covers .mov, the default iPhone export format.
var AllowedVideoContentTypes = map[string]bool{
	"video/mp4":       true,
	"video/webm":      true,
	"video/quicktime": true,
}

// HeroVideo is the single shared type across the repo, service, and handler
// layers for the homepage background video.
type HeroVideo struct {
	ID          string    `json:"id"`
	StorageKey  string    `json:"-"`           // S3 object key - never sent to the client
	FileName    string    `json:"file_name"`
	FileSize    *int64    `json:"file_size"`
	ContentType *string   `json:"content_type"`
	UploadedBy  *string   `json:"uploaded_by"` // JWT sub of the uploading admin
	IsActive    bool      `json:"is_active"`
	IsVisible   bool      `json:"is_visible"`
	CreatedAt   time.Time `json:"created_at"`
	// VideoURL is a short-lived presigned S3 URL populated by the service at
	// read time. Omitted when no presigner is configured (dev without S3 creds).
	VideoURL string `json:"video_url,omitempty"`
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

// --- Translation review types ---

// Translation mirrors a row in the `translations` table. Used by the admin
// review panel; the public read path returns translated text inline via the
// COALESCE join, never as a Translation struct.
type Translation struct {
	ID             string     `json:"id"`
	TableName      string     `json:"table_name"`
	RecordID       string     `json:"record_id"`
	FieldName      string     `json:"field_name"`
	Locale         string     `json:"locale"`
	SourceText     string     `json:"source_text"`
	TranslatedText string     `json:"translated_text"`
	IsAIGenerated  bool       `json:"is_ai_generated"`
	ApprovedBy     *string    `json:"approved_by"`
	ApprovedAt     *time.Time `json:"approved_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// TranslationListItem is a Translation plus the human-readable label of its
// parent record, synthesized in SQL via a CASE on table_name. The bilingual
// reviewer needs this label to know which post/page/event they are looking
// at - the bare table_name + record_id pair gives them no context.
type TranslationListItem struct {
	Translation
	// RecordTitle is one of:
	//   posts                  -> the post's title
	//   page_content           -> "<page_slug> / <section_key>"
	//   calendar_events        -> "<title> · <date>"
	//   calendar_month_notes   -> "Month note · YYYY-MM"
	// Falls back to "<table_name>:<short uuid>" if the parent row was deleted.
	RecordTitle string `json:"record_title"`
}

// TranslationListResponse is the GET /admin/translations response shape.
// Total enables pagination UI without a second HEAD/COUNT request.
type TranslationListResponse struct {
	Items []TranslationListItem `json:"items"`
	Total int                   `json:"total"`
}

// ApproveTranslationRequest is the PATCH /admin/translations/:id body.
// translated_text is optional - omit it to approve the AI output as-is,
// include it to approve a human-edited version.
type ApproveTranslationRequest struct {
	TranslatedText *string `json:"translated_text"`
}

// --- Request types for tags ---

type CreateTagRequest struct {
	Name string `json:"name"`
}

func (r *CreateTagRequest) Validate() error {
	if r.Name == "" {
		return errors.New("name is required")
	}
	return nil
}

type ReplaceTagsRequest struct {
	TagIDs []string `json:"tag_ids"`
}

// --- Assistant chatbox types ---

// AssistantMessage represents a single turn in the chat conversation history.
type AssistantMessage struct {
	Role    string `json:"role"`    // "user" or "assistant"
	Content string `json:"content"`
}

// AssistantChatRequest is the request body for POST /api/v1/assistant/chat.
type AssistantChatRequest struct {
	Message string             `json:"message"`
	History []AssistantMessage `json:"history,omitempty"`
}

// AssistantSource identifies a piece of church content used to answer a question.
// The frontend renders these as clickable chips so visitors can verify the answer.
type AssistantSource struct {
	ID    string `json:"id"`
	Type  string `json:"type"`  // "post", "calendar_event", "page"
	Title string `json:"title"`
}

// AssistantChatResponse is the response body for POST /api/v1/assistant/chat.
type AssistantChatResponse struct {
	Answer  string            `json:"answer"`
	Sources []AssistantSource `json:"sources"`
}
