package model

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
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
	ID           string     `json:"id"`
	Type         PostType   `json:"type"`
	Title        string     `json:"title"`
	Body         *string    `json:"body"`
	EventDate    *time.Time `json:"event_date"`
	ExternalLink *string    `json:"external_link"`
	AdminID      *string    `json:"admin_id"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	// ArchivedAt records when an admin manually moved an event into the Past
	// section. NULL means "not manually archived" - the event's section is then
	// decided by event_date alone. Sent as null (not omitted) so the frontend
	// can rely on the field always being present. See migration 000007.
	ArchivedAt *time.Time      `json:"archived_at"`
	Images     []PostImage     `json:"images,omitempty"`
	Reactions  []ReactionCount `json:"reactions,omitempty"`
	Tags       []Tag           `json:"tags,omitempty"`
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
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	DisplayName *string `json:"display_name"`
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

// SetArchivedRequest is the body for PATCH /posts/{id}/archive. Archived=true
// moves an event into the Past section; false returns it to Upcoming. Kept
// separate from UpdatePostRequest because archiving is a section change, not a
// content edit, and travels through its own repository write (UpdatePost's
// COALESCE pattern cannot set a column back to NULL, which un-archiving needs).
type SetArchivedRequest struct {
	Archived bool `json:"archived"`
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
	CalendarEventTypeGraduation   CalendarEventType = "graduation"
)

// IconNone is the sentinel for "this event shows no icon". It is a real,
// selectable state in the picker (the dashed None tile) rather than an empty
// string, so the column stays NOT NULL and the value reads as deliberate in
// the database instead of looking like missing data.
const IconNone = "none"

// AllowedCalendarIcons is the curated Phosphor icon key set admins may choose from.
var AllowedCalendarIcons = map[string]bool{
	"cake": true, "book-open": true, "bell": true, "heart": true, "star": true,
	"users": true, "music-notes": true, "cross": true, "flame": true, "sparkle": true,
	"graduation-cap": true, IconNone: true,
}

// AllowedCalendarColors is the editorial palette admins may choose from by name.
// black is the paper calendars' banner-bar color (near-black ribbon). Admins are
// no longer limited to these - see IsAllowedCalendarColor.
var AllowedCalendarColors = map[string]bool{
	"slate": true, "red": true, "amber": true, "emerald": true,
	"sky": true, "violet": true, "rose": true, "stone": true, "black": true,
}

// IsAllowedCalendarColor reports whether a color is storable on an event. It
// accepts either a named palette key or a 6-digit hex, which is what lets an
// admin save a custom color without a deploy.
//
// This is the security boundary for the feature, not just a data check: the
// value ends up in an inline style attribute on the public calendar, so the
// exact-match/regex pair is what stops `red; background-image:url(...)` from
// ever reaching a browser. The DB CHECK on calendar_palette_colors is the
// second layer.
func IsAllowedCalendarColor(color string) bool {
	return AllowedCalendarColors[color] || hexColorRegexp.MatchString(color)
}

const (
	// maxEventTypeSlugLen bounds the generated key. Slugs are opaque and only
	// ever seen by developers, so this is about keeping the FK sane, not about
	// how much an admin may type.
	maxEventTypeSlugLen = 40
	// maxEventTypeLabelLen bounds what an admin types. Long enough for
	// "Church Anniversary Celebration", short enough that a chip still fits.
	maxEventTypeLabelLen = 60
)

// eventTypeSlugRegexp is the shape every event_type must have by the time it
// reaches the database. Existence is a database question now (the foreign key
// answers it), so the model's remaining job is shape.
var eventTypeSlugRegexp = regexp.MustCompile(`^[a-z0-9_]{1,` + fmt.Sprint(maxEventTypeSlugLen) + `}$`)

// vietnameseDMap folds the two Vietnamese letters that NFD cannot decompose,
// since đ/Đ are distinct letters rather than d plus a combining mark.
var vietnameseDMap = strings.NewReplacer("đ", "d", "Đ", "D")

// SlugifyEventType converts an admin-typed label ("Fellowship Meal") into the
// opaque key stored on events and referenced by the foreign key
// ("fellowship_meal").
//
// It must be *stable* above all: the same label always yields the same slug, so
// two admins who both type "Baptism" land on one shared type instead of two
// near-duplicates. That stability is what makes the inline create-on-the-fly
// flow safe to expose.
//
// Diacritics are folded to ASCII rather than stripped, so a Vietnamese label
// produces a readable key ("Lễ Báp-têm" -> "le_bap_tem") instead of shattering
// into single letters. Returns "" when nothing usable survives; the caller
// decides what that means.
func SlugifyEventType(label string) string {
	folded, _, err := transform.String(
		transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC),
		vietnameseDMap.Replace(label),
	)
	if err != nil {
		folded = label // folding is best-effort; the filter below is the guarantee
	}

	var b strings.Builder
	lastWasSep := true // leading separators are dropped
	for _, r := range strings.ToLower(folded) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastWasSep = false
		case r == '\'' || r == '’' || r == '"':
			// Quotes vanish rather than splitting a word, so "Mother's Day"
			// slugs to mothers_day and not mother_s_day. This is what every
			// other slugifier does, and it keeps possessives readable.
		case !lastWasSep:
			// Any run of non-alphanumerics collapses to a single underscore.
			b.WriteByte('_')
			lastWasSep = true
		}
	}

	slug := strings.Trim(b.String(), "_")
	if len(slug) > maxEventTypeSlugLen {
		// Trim again after cutting: truncation must not leave a dangling "_",
		// or two labels could differ only by that.
		slug = strings.Trim(slug[:maxEventTypeSlugLen], "_")
	}
	return slug
}

// CalendarEventTypeDef is one row of the admin-managed event-type vocabulary.
// DefaultIcon/DefaultColor carry the look a new event of this type starts with,
// which is why creating a type is enough to make it feel designed.
type CalendarEventTypeDef struct {
	Slug         string    `json:"slug"`
	Label        string    `json:"label"`
	DefaultIcon  string    `json:"default_icon"`
	DefaultColor string    `json:"default_color"`
	IsBuiltin    bool      `json:"is_builtin"`
	SortOrder    int       `json:"sort_order"`
	AdminID      *string   `json:"admin_id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// PaletteColor is one saved custom swatch in the shared calendar palette.
// Deliberately unnamed - naming every swatch is ceremony an admin would not
// maintain, and the color itself is the label.
type PaletteColor struct {
	ID        string    `json:"id"`
	Hex       string    `json:"hex"`
	SortOrder int       `json:"sort_order"`
	AdminID   *string   `json:"admin_id"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateEventTypeRequest struct {
	Label        string `json:"label"`
	DefaultIcon  string `json:"default_icon"`
	DefaultColor string `json:"default_color"`
}

func (r *CreateEventTypeRequest) Validate() error {
	label := strings.TrimSpace(r.Label)
	if label == "" {
		return errors.New("label is required")
	}
	if len(label) > maxEventTypeLabelLen {
		return fmt.Errorf("label must be %d characters or fewer", maxEventTypeLabelLen)
	}
	// A label made entirely of punctuation slugs to nothing, which would leave
	// the row unaddressable. Reject it here with a message about the label
	// rather than letting an empty primary key surface as a database error.
	if SlugifyEventType(label) == "" {
		return errors.New("label must contain at least one letter or number")
	}
	if !AllowedCalendarIcons[r.DefaultIcon] {
		return fmt.Errorf("invalid default_icon: %s", r.DefaultIcon)
	}
	if !IsAllowedCalendarColor(r.DefaultColor) {
		return fmt.Errorf("invalid default_color: %s", r.DefaultColor)
	}
	return nil
}

type CreatePaletteColorRequest struct {
	Hex string `json:"hex"`
}

func (r *CreatePaletteColorRequest) Validate() error {
	// Hex only, not IsAllowedCalendarColor: a named key would save a swatch the
	// picker already shows as a built-in, and would fail the DB CHECK anyway.
	if !hexColorRegexp.MatchString(r.Hex) {
		return fmt.Errorf("invalid hex color: %s", r.Hex)
	}
	return nil
}

type CalendarEvent struct {
	ID   string `json:"id"`
	Date string `json:"date"` // YYYY-MM-DD
	// EndDate is the inclusive last day of a multi-day span (YYYY-MM-DD), or
	// nil for a single-day event. Drives the banner ribbon in the grid.
	EndDate        *string           `json:"end_date,omitempty"`
	Title          string            `json:"title"`
	EventType      CalendarEventType `json:"event_type"`
	Icon           string            `json:"icon"`
	PrivateAddress *string           `json:"private_address,omitempty"`
	// AddressPublic controls whether private_address is shown on the public
	// website. The PNG export always includes the address regardless.
	AddressPublic bool `json:"address_public"`
	// PlaceID is the venue this event's address resolved to (migration 000014),
	// or nil for an event with no address and for every event authored before
	// that migration. Resolved server-side on write from PrivateAddress - never
	// supplied by a client - which is why it appears on the response type but on
	// neither request type.
	PlaceID *string `json:"place_id,omitempty"`
	// Place is that venue expanded - the name and address the Locations strip
	// prints. Joined on read rather than stored, so an admin renaming a place
	// changes every event at it at once.
	//
	// Stripped for non-admins under the SAME condition as PrivateAddress: a
	// place name identifies a household as precisely as its street number does,
	// so "MST House" must not survive a hidden address.
	Place *CalendarPlace `json:"place,omitempty"`
	Color string         `json:"color"`
	// SeriesID groups the occurrences one recurrence toggle created. It holds
	// the ANCHOR occurrence's own id, so series_id == id marks the anchor. nil
	// on every one-off event, which is every event authored before migration
	// 000015.
	SeriesID *string `json:"series_id,omitempty"`
	// RecurrenceRule and RecurrenceUntil describe the SERIES this event belongs
	// to. The database stores them on the anchor row only - the rule describes
	// the series, so it is written once rather than copied onto every sibling -
	// but the month read resolves them through series_id, so every member of a
	// series carries them on the way out. Without that, an admin opening a
	// generated occurrence would be told it does not repeat, which is true of
	// the row and false of the event in front of them.
	RecurrenceRule  *string   `json:"recurrence_rule,omitempty"`
	RecurrenceUntil *string   `json:"recurrence_until,omitempty"`
	Notes           *string   `json:"notes"`
	AdminID         *string   `json:"admin_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	// MachineTranslated: see Post.MachineTranslated. True when this event's
	// title or notes were served via an unapproved AI translation. Omitted
	// from JSON on English responses and on approved translations.
	MachineTranslated bool `json:"machine_translated,omitempty"`
	// TitleSource/NotesSource carry the canonical English text alongside a
	// translated Title/Notes, so an admin can VIEW the calendar in Vietnamese
	// while the edit form still pre-fills (and therefore saves) English. Without
	// them, saving an event from /vi would write the machine translation back
	// into the source column.
	//
	// Populated only on localized responses, and stripped for non-admins in the
	// handler - a public visitor has no use for them. Both nil on English
	// responses, where Title/Notes already ARE the source.
	TitleSource *string `json:"title_source,omitempty"`
	NotesSource *string `json:"notes_source,omitempty"`
	// SourceLocale is the language Title/Notes are actually written in - what the
	// admin typed, not a policy. 'en' for everything authored before migration
	// 000013. Serving reads it to decide whether this viewer needs a translation
	// at all, and the edit form defaults its language control to it so a
	// correction sticks instead of being re-detected away on the next save.
	SourceLocale string `json:"source_locale"`
}

// CalendarPlace is one venue in the calendar's Locations strip - a name and the
// address it stands for. Mirrors a row in calendar_places (migration 000014).
//
// The name is a function of the address (two different places cannot share one),
// which is why places are keyed by the normalized address rather than hung off
// each event: the model is asked what a place is called exactly once, the first
// time that address appears, and every later event there reuses the answer.
type CalendarPlace struct {
	ID string `json:"id"`
	// Address as an admin typed it - this is what gets printed. The normalized
	// address_key it is stored under is a matching detail and never leaves the
	// database.
	Address string `json:"address"`
	Name    string `json:"name"`
	// NameSource is 'ai' or 'admin'. The naming worker only ever writes over an
	// 'ai' row, so an admin's rename is permanent.
	NameSource string `json:"name_source"`
	// Kept off the wire entirely. A place is most often served nested inside an
	// event, where it comes from a LEFT JOIN that selects only the three columns
	// above - serializing these would emit "0001-01-01T00:00:00Z" and claim the
	// church was created in year one. Nothing downstream needs them.
	CreatedAt time.Time `json:"-"`
	UpdatedAt time.Time `json:"-"`
	// EventCount is populated only by the list endpoint, where it orders the
	// suggestions an admin sees. Zero elsewhere.
	EventCount int `json:"event_count,omitempty"`
}

// PlaceNameSource values for CalendarPlace.NameSource. Kept as constants
// because the guard that protects an admin rename compares against them.
const (
	PlaceNameSourceAI    = "ai"
	PlaceNameSourceAdmin = "admin"
)

// MaxPlaceNameLen caps a venue label, in runes rather than bytes so a
// Vietnamese name is never cut mid-character. Shared by the model-answer
// sanitizer and the admin rename validator - the same ceiling has to apply to
// both, or a human could type a label the model would have been refused.
const MaxPlaceNameLen = 40

// UpdateCalendarPlaceRequest renames a venue. Only the name is editable: the
// address is the place's identity (it is what address_key is derived from), so
// changing it would silently redefine which events belong here. Correcting a
// mistyped address is an edit to the EVENT, which re-resolves it to the right
// place and leaves this one behind.
type UpdateCalendarPlaceRequest struct {
	Name string `json:"name"`
}

func (r *UpdateCalendarPlaceRequest) Validate() error {
	name := strings.TrimSpace(r.Name)
	if name == "" {
		return errors.New("name is required")
	}
	if len([]rune(name)) > MaxPlaceNameLen {
		return fmt.Errorf("name must be %d characters or fewer", MaxPlaceNameLen)
	}
	// A label goes into a single-line strip and into the exported image; a
	// newline would break both. Rejecting beats silently rewriting what the
	// admin typed.
	if strings.ContainsAny(name, "\n\r") {
		return errors.New("name must be a single line")
	}
	return nil
}

type CalendarMonthNote struct {
	ID    string `json:"id"`
	Year  int    `json:"year"`
	Month int    `json:"month"`
	// Content is the freeform note rendered in the info strip BELOW the grid -
	// logistics, an address, a reminder. Theme and the two verse fields are the
	// devotional content rendered in the card ABOVE the grid. They share a row
	// because they share a (year, month) key, not because they are the same
	// kind of thing. See migration 000017.
	Content string `json:"content"`
	// Theme is the month's theme, a short phrase. Empty string means unset, and
	// the card omits itself entirely when theme and verse are both empty.
	Theme string `json:"theme"`
	// VerseText is the memory verse, plain text - never HTML. It is rendered
	// with {} interpolation rather than dangerouslySetInnerHTML, so unlike a
	// post body it never passes through sanitizeBody.
	VerseText string `json:"verse_text"`
	// VerseReference is the citation, e.g. "1 Thessalonians 5:18". Stored apart
	// from VerseText so the translation worker sees it as its own field; left
	// inside the verse, a model rewriting the sentence would feel free to
	// reformat the chapter and verse numbers with it.
	VerseReference string    `json:"verse_reference"`
	AdminID        *string   `json:"admin_id"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	// MachineTranslated: true when this month note's CONTENT - the footnote in
	// the info strip below the grid - was served via an unapproved AI
	// translation. Omitted on English responses.
	MachineTranslated bool `json:"machine_translated,omitempty"`
	// CardMachineTranslated: the same claim for the three fields the theme card
	// above the grid displays (theme, verse_text, verse_reference).
	//
	// Two flags rather than one because there are two badges in two places. A
	// single row-wide flag made each badge answer for text displayed somewhere
	// else on the page - the note's badge lighting up because the theme was
	// unapproved, and vice versa - which tells the reader something false about
	// the text they are actually looking at.
	CardMachineTranslated bool `json:"card_machine_translated,omitempty"`
	// ContentSource and its three siblings: the authored text, so the modal edits
	// the source even while the page displays a translation. See
	// CalendarEvent.TitleSource - same rule, same handler-side stripping. All
	// four are stripped together for non-admins; adding a field here without
	// adding it to that strip would leak unapproved source text publicly.
	ContentSource        *string `json:"content_source,omitempty"`
	ThemeSource          *string `json:"theme_source,omitempty"`
	VerseTextSource      *string `json:"verse_text_source,omitempty"`
	VerseReferenceSource *string `json:"verse_reference_source,omitempty"`
	// VerseTextAlt: the verse's wording in the other language, as the admin
	// typed it. Admin-only and stripped with the *Source fields - a visitor is
	// already served the right language by the CASE above, so this would only
	// be the same verse twice. Round-trips under the same JSON key the upsert
	// request accepts, so the modal sends back exactly what it received.
	VerseTextAlt *string `json:"verse_text_alt,omitempty"`
	// SourceLocale: see CalendarEvent.SourceLocale. One locale covers all four
	// text fields, matching how CalendarEvent shares one across title and notes.
	SourceLocale string `json:"source_locale"`
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
	EndDate        *string           `json:"end_date"`
	Title          string            `json:"title"`
	EventType      CalendarEventType `json:"event_type"`
	Icon           string            `json:"icon"`
	PrivateAddress *string           `json:"private_address"`
	AddressPublic  bool              `json:"address_public"`
	Color          string            `json:"color"`
	// Recurrence turns this create into a series: nil or "" for a one-off,
	// otherwise "weekly" or "yearly". The occurrences are generated server-side
	// at write time - the client never computes dates and never sends more than
	// this one event.
	Recurrence *string `json:"recurrence"`
	// RecurrenceUntil is the admin's "Ends on" date (YYYY-MM-DD). nil means
	// open-ended, which is the ONLY case the three-year horizon and its warning
	// apply to: a series with a real end date is generated to exactly that date
	// and never needs extending.
	RecurrenceUntil *string `json:"recurrence_until"`
	Notes           *string `json:"notes"`
	// No source_locale field: the language is detected from Title+Notes by the
	// service and never supplied by the client. See resolveSourceLocale.
}

func (r *CreateCalendarEventRequest) Validate() error {
	if r.Date == "" {
		return errors.New("date is required")
	}
	if r.Title == "" {
		return errors.New("title is required")
	}
	// Only shape is checked here. Whether the type actually exists is a
	// database question now (the calendar_event_types foreign key answers it),
	// and the service asks it before we get this far - a closed switch would
	// defeat the whole point of admin-created types.
	if !eventTypeSlugRegexp.MatchString(string(r.EventType)) {
		return fmt.Errorf("invalid event_type: %s", r.EventType)
	}
	if !AllowedCalendarIcons[r.Icon] {
		return fmt.Errorf("invalid icon: %s", r.Icon)
	}
	if !IsAllowedCalendarColor(r.Color) {
		return fmt.Errorf("invalid color: %s", r.Color)
	}
	// A multi-day span must end on or after it starts. Both dates are present
	// on create, so we can fully cross-check here; the DB CHECK is the backstop.
	if r.EndDate != nil && *r.EndDate != "" {
		if err := validateDateRange(r.Date, *r.EndDate); err != nil {
			return err
		}
	}
	if err := r.validateRecurrence(); err != nil {
		return err
	}
	return nil
}

// validateRecurrence checks the two recurrence fields together, because
// neither means anything alone: an "ends on" date with no rule is not a
// series, and a rule whose end date precedes its start would generate nothing.
//
// The multi-day rejection is a deliberate v1 scope line, not an oversight.
// Repeating a span raises a question nobody has answered - whether the second
// occurrence of a three-day retreat keeps the three days or just the first -
// and refusing it here costs nothing while lifting it later is a UI change
// rather than a migration.
func (r *CreateCalendarEventRequest) validateRecurrence() error {
	if r.Recurrence == nil || *r.Recurrence == "" {
		if r.RecurrenceUntil != nil && *r.RecurrenceUntil != "" {
			return errors.New("recurrence_until requires a recurrence rule")
		}
		return nil
	}
	if r.EndDate != nil && *r.EndDate != "" {
		return errors.New("a multi-day event cannot repeat yet")
	}
	if r.RecurrenceUntil != nil && *r.RecurrenceUntil != "" {
		if err := validateDateRange(r.Date, *r.RecurrenceUntil); err != nil {
			return fmt.Errorf("recurrence_until: %w", err)
		}
	}
	return nil
}

// CalendarSeries summarises one recurring series for the admin panel. It is a
// read-only view assembled by a GROUP BY, not a table - the series has no row
// of its own beyond its anchor occurrence.
type CalendarSeries struct {
	// ID is the anchor occurrence's id, which is also every member's series_id.
	ID    string `json:"id"`
	Title string `json:"title"`
	Rule  string `json:"rule"`
	// Until is the admin's "Ends on" date, or nil for an open-ended series.
	Until *string `json:"until,omitempty"`
	// LastDate is the furthest occurrence currently written.
	LastDate string `json:"last_date"`
	Count    int    `json:"count"`
	// NeedsExtension is true when this series will run out of occurrences soon
	// and more can still be generated. A series with an "Ends on" date that has
	// been fully generated is finished, not running out, and never sets this -
	// which is why an admin with only fixed-term series is never nagged.
	NeedsExtension bool `json:"needs_extension"`
}

// WriteScope says which part of a recurring series an edit or delete applies
// to. It exists because the alternative - letting the server assume - is how
// an admin deletes forty birthdays intending to delete one. There is
// deliberately no zero-value default: ParseWriteScope rejects an empty string
// rather than picking the safest-looking option, so a client that forgets to
// send a scope gets a 400 instead of a silent mass edit.
type WriteScope string

const (
	// ScopeOccurrence touches the one row the admin clicked. It is also the
	// only legal scope for an event that is not part of a series.
	ScopeOccurrence WriteScope = "occurrence"
	// ScopeFollowing touches that row and every later one in the series. Past
	// occurrences are left alone because they are a record of what happened.
	ScopeFollowing WriteScope = "following"
	// ScopeSeries touches every row in the series, past included.
	ScopeSeries WriteScope = "series"
)

// ParseWriteScope converts the wire value, rejecting anything unrecognized -
// including "", which is the case this function mainly exists to catch.
func ParseWriteScope(v string) (WriteScope, error) {
	switch WriteScope(v) {
	case ScopeOccurrence, ScopeFollowing, ScopeSeries:
		return WriteScope(v), nil
	case "":
		return "", errors.New("scope is required: one of occurrence, following, series")
	default:
		return "", fmt.Errorf("invalid scope: %s", v)
	}
}

// Recurrence rules are RFC 5545 RRULE text since migration 000016. The model
// deliberately does NOT own the vocabulary: service.ParseRRule is the single
// authority on which rules exist, because the set of rules that may be STORED
// has to be exactly the set the generator can EXPAND, and the generator lives
// there. Checking the shape in two places would let those two sets drift, and a
// rule that can be saved but not expanded renders confidently wrong dates on
// the public calendar.
//
// What stays here is the part that is genuinely about the request as a whole:
// how the recurrence fields relate to the event's own dates.

// validateDateRange parses two YYYY-MM-DD strings and confirms end is on or
// after start. Shared by the create and update validators so the rule lives in
// one place.
func validateDateRange(start, end string) error {
	s, err := time.Parse("2006-01-02", start)
	if err != nil {
		return fmt.Errorf("invalid date: %s", start)
	}
	e, err := time.Parse("2006-01-02", end)
	if err != nil {
		return fmt.Errorf("invalid end_date: %s", end)
	}
	if e.Before(s) {
		return errors.New("end_date must be on or after date")
	}
	return nil
}

type UpdateCalendarEventRequest struct {
	Date           *string            `json:"date"`
	EndDate        *string            `json:"end_date"`
	Title          *string            `json:"title"`
	EventType      *CalendarEventType `json:"event_type"`
	Icon           *string            `json:"icon"`
	PrivateAddress *string            `json:"private_address"`
	// AddressPublic is written directly (the EventModal always submits the full
	// event), so a partial PATCH never silently flips visibility.
	AddressPublic bool    `json:"address_public"`
	Color         *string `json:"color"`
	Notes         *string `json:"notes"`
	// No source_locale field - see CreateCalendarEventRequest. An edit re-detects
	// from the patched text, so rewriting an English event in Vietnamese moves it
	// to the Vietnamese side automatically.

	// Recurrence changes how the series repeats. Present only when the admin
	// actually touched the Repeats controls; nil leaves the rule alone, and an
	// empty string means "stop repeating", which keeps the occurrences already
	// on the calendar and simply stops generating more.
	//
	// A rule change is only accepted with scope=series. Applying a new rule to
	// part of a series would mean splitting it into two, which the design
	// deliberately defers (DECISIONS.md 2026-09-14) - so the honest answer is to
	// change the whole thing or delete it and start again.
	Recurrence *string `json:"recurrence"`
	// RecurrenceUntil is the "Ends on" date. Follows Recurrence: nil leaves it
	// alone, empty string clears it back to open-ended.
	RecurrenceUntil *string `json:"recurrence_until"`
	// RecurrenceCleanup says what to do with the dates already on the calendar
	// when recurrence is switched OFF. Required in that case and meaningless
	// otherwise.
	//
	// It exists because "stop repeating" has two reasonable meanings and the
	// server must not pick. Keeping every generated date leaves the calendar
	// showing an event that the form now calls "does not repeat". Deleting the
	// future ones removes events the congregation may already have planned
	// around. Neither is safe to assume, which is the same reason every edit
	// and delete carries an explicit scope.
	RecurrenceCleanup *string `json:"recurrence_cleanup"`
}

// Recurrence cleanup modes, used when a series' rule is cleared.
const (
	// RecurrenceCleanupKeep stops generating new dates and leaves every
	// existing one exactly where it is.
	RecurrenceCleanupKeep = "keep"
	// RecurrenceCleanupFuture additionally removes occurrences that have not
	// happened yet. The past is always kept: it is a record of what the church
	// actually did, not a schedule to be tidied.
	RecurrenceCleanupFuture = "future"
)

// ValidateRecurrenceCleanup checks the cleanup mode against the rule change it
// accompanies. Deliberately rejects a missing value rather than defaulting - a
// client that forgets it gets a 400, not a guess about the admin's intent.
//
// Removing EVERY date is intentionally not an option here. That is what Delete
// with scope=series already does, and giving one operation two ways to wipe a
// series is how the two drift apart.
func (r *UpdateCalendarEventRequest) ValidateRecurrenceCleanup() error {
	clearing := r.Recurrence != nil && *r.Recurrence == ""
	if !clearing {
		if r.RecurrenceCleanup != nil {
			return errors.New("recurrence_cleanup only applies when recurrence is being cleared")
		}
		return nil
	}
	if r.RecurrenceCleanup == nil {
		return errors.New("recurrence_cleanup is required when turning recurrence off: one of keep, future")
	}
	switch *r.RecurrenceCleanup {
	case RecurrenceCleanupKeep, RecurrenceCleanupFuture:
		return nil
	default:
		return fmt.Errorf("invalid recurrence_cleanup: %s", *r.RecurrenceCleanup)
	}
}

func (r *UpdateCalendarEventRequest) Validate() error {
	// Shape only - see CreateCalendarEventRequest.Validate.
	if r.EventType != nil && !eventTypeSlugRegexp.MatchString(string(*r.EventType)) {
		return fmt.Errorf("invalid event_type: %s", *r.EventType)
	}
	if r.Icon != nil && !AllowedCalendarIcons[*r.Icon] {
		return fmt.Errorf("invalid icon: %s", *r.Icon)
	}
	if r.Color != nil && !IsAllowedCalendarColor(*r.Color) {
		return fmt.Errorf("invalid color: %s", *r.Color)
	}
	// On a PATCH the start date may be omitted (unchanged). Cross-check the
	// range when both are present; otherwise just confirm end_date parses. The
	// DB CHECK still guards the case where only end_date is sent.
	if r.EndDate != nil && *r.EndDate != "" {
		if r.Date != nil && *r.Date != "" {
			if err := validateDateRange(*r.Date, *r.EndDate); err != nil {
				return err
			}
		} else if _, err := time.Parse("2006-01-02", *r.EndDate); err != nil {
			return fmt.Errorf("invalid end_date: %s", *r.EndDate)
		}
	}
	return nil
}

// Length caps for a month note's four text fields.
//
// These are the only ceiling in the stack: the columns are `text`, the form is
// a textarea, and every non-empty field is enqueued for translation - so
// without them one paste sends an unbounded blob to the model. The values are
// generous against real use (a theme is two to five words, the longest verses
// in either testament are comfortably under 800 characters) and are counted in
// RUNES, not bytes, because Vietnamese diacritics are multi-byte and a byte cap
// would give Vietnamese authors roughly a third of the room English ones get.
const (
	MaxMonthThemeLen    = 120
	MaxMonthVerseLen    = 1000
	MaxMonthVerseRefLen = 120
	MaxMonthNoteLen     = 4000
)

type UpsertMonthNoteRequest struct {
	Content        string `json:"content"`
	Theme          string `json:"theme"`
	VerseText      string `json:"verse_text"`
	VerseReference string `json:"verse_reference"`
	// VerseTextAlt is the same verse in the OTHER language, typed by the admin.
	//
	// It exists because the memory verse is never machine translated. A
	// Vietnamese C&MA congregation reads Bản Truyền Thống; an AI paraphrase of
	// scripture is close to the published wording without being it, which is
	// useless for the one piece of text on the page people are meant to learn
	// word for word. So the admin supplies both wordings and the service files
	// this one as a human-authored, pre-approved translation.
	//
	// It is NOT evidence for language detection - it is deliberately the
	// opposite language from the rest of the note.
	VerseTextAlt string `json:"verse_text_alt"`
	// No source_locale field - detected from the note's own four fields. See
	// CreateCalendarEventRequest.
}

// Validate bounds each field's length and keeps the two single-line fields on
// one line.
//
// Every field is optional: clearing all four is how an admin removes the card
// and the note, so an empty request is valid by design, not by omission.
func (r *UpsertMonthNoteRequest) Validate() error {
	for _, f := range []struct {
		name  string
		value string
		max   int
	}{
		{"theme", r.Theme, MaxMonthThemeLen},
		{"verse_text", r.VerseText, MaxMonthVerseLen},
		{"verse_text_alt", r.VerseTextAlt, MaxMonthVerseLen},
		{"verse_reference", r.VerseReference, MaxMonthVerseRefLen},
		{"content", r.Content, MaxMonthNoteLen},
	} {
		if utf8.RuneCountInString(f.value) > f.max {
			return fmt.Errorf("%s must be %d characters or fewer", f.name, f.max)
		}
	}
	// The theme is a headline and the reference is a citation - both render on
	// one line in the card. A newline in either means the form has been pasted
	// into wrongly, and letting it through would break that layout. The verse
	// itself and the note are free to wrap.
	if strings.ContainsAny(r.Theme, "\n\r") {
		return errors.New("theme must be a single line")
	}
	if strings.ContainsAny(r.VerseReference, "\n\r") {
		return errors.New("verse_reference must be a single line")
	}
	return nil
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
	StorageKey  string    `json:"-"` // S3 object key - never sent to the client
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

// PageBlock represents a single typed, ordered block on a page. The block model
// replaces the old flat section_key approach for pages like About that need
// structural flexibility (add/remove/reorder sections). Connect keeps using
// sections because its fields are structured data, not prose.
type PageBlock struct {
	ID        string         `json:"id,omitempty"`
	BlockType string         `json:"block_type"`
	Position  int            `json:"position"`
	Title     string         `json:"title"`
	Content   string         `json:"content"`
	Props     map[string]any `json:"props"`
	// MachineTranslated is true when any field of this block was served from
	// an unapproved AI translation. Omitted on English responses.
	MachineTranslated bool `json:"machine_translated,omitempty"`
}

// AllowedBlockTypes is the server-side allow-list for block_type values. A
// crafted payload cannot persist an unrenderable type - the handler rejects
// any block whose type is not in this set.
var AllowedBlockTypes = map[string]bool{
	"hero":      true,
	"rich_text": true,
	"quote":     true,
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
	Role    string `json:"role"` // "user" or "assistant"
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
	Type  string `json:"type"` // "post", "calendar_event", "page"
	Title string `json:"title"`
}

// AssistantChatResponse is the response body for POST /api/v1/assistant/chat.
type AssistantChatResponse struct {
	Answer  string            `json:"answer"`
	Sources []AssistantSource `json:"sources"`
}
