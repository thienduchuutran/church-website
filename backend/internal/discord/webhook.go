package discord

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// Identity defaults applied per-message so the same webhook URL can post under
// any name/avatar without re-provisioning the Discord-side webhook.
const (
	defaultUsername  = "Duc"
	defaultAvatarURL = "https://cdn.discordapp.com/avatars/1018271669938307102/2aca3d1181e6643b78d9401b25582e48.webp"
)

// Discord rejects messages over 2000 codepoints; truncating with an ellipsis
// degrades gracefully instead of dropping the notification entirely.
const (
	maxContentLength = 2000
	truncationSuffix = "..."
)

// httpClient bounds the wait on Discord's webhook endpoint. The caller in
// service/posts.go fires SendToDiscord in a detached goroutine, so without a
// timeout a hung Discord request would leak the goroutine for the lifetime of
// the process.
var httpClient = &http.Client{Timeout: 10 * time.Second}

// Embed is the rich-card payload Discord renders inside a colored container.
// Retained for post types not yet migrated to plain `content` (bible_study,
// playlist, gallery_album).
type Embed struct {
	Title       string      `json:"title"`
	Description string      `json:"description,omitempty"`
	URL         string      `json:"url,omitempty"`
	Color       int         `json:"color"`
	Footer      EmbedFooter `json:"footer"`
	Timestamp   string      `json:"timestamp"`
}

type EmbedFooter struct {
	Text string `json:"text"`
}

// Payload is the Discord webhook request body. Username and AvatarURL apply to
// every message; Content (plain text) and Embeds (rich card) are mutually
// exclusive in practice - omitempty hides the unused field from the JSON.
type Payload struct {
	Username  string  `json:"username"`
	AvatarURL string  `json:"avatar_url"`
	Content   string  `json:"content,omitempty"`
	Embeds    []Embed `json:"embeds,omitempty"`
}

var webhookEnvKeys = map[model.PostType]string{
	model.PostTypeEvent:        "DISCORD_WEBHOOK_EVENTS",
	model.PostTypeAnnouncement: "DISCORD_WEBHOOK_ANNOUNCEMENTS",
	model.PostTypeBibleStudy:   "DISCORD_WEBHOOK_BIBLE_STUDIES",
	model.PostTypePlaylist:     "DISCORD_WEBHOOK_PLAYLISTS",
	model.PostTypeGalleryAlbum: "DISCORD_WEBHOOK_GALLERY",
}

var colorByType = map[model.PostType]int{
	model.PostTypeBibleStudy:   16711516, // #FEE75C yellow
	model.PostTypePlaylist:     1948500,  // #1DB954 Spotify green
	model.PostTypeGalleryAlbum: 15418270, // #EB459E pink
}

// SendToDiscord sends a post notification to the matching Discord channel via webhook.
func SendToDiscord(post model.Post) error {
	envKey, ok := webhookEnvKeys[post.Type]
	if !ok {
		return fmt.Errorf("no webhook configured for post type %s", post.Type)
	}

	webhookURL := os.Getenv(envKey)
	if webhookURL == "" {
		return fmt.Errorf("environment variable %s is not set", envKey)
	}

	body, err := json.Marshal(buildPayload(post))
	if err != nil {
		return fmt.Errorf("failed to marshal discord payload: %w", err)
	}

	resp, err := httpClient.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to send discord webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord webhook returned status %d", resp.StatusCode)
	}
	return nil
}

// buildPayload routes by post type because the two formats are not equivalent:
// flat content reads as a normal message in-channel; embeds add a card border
// that's the right affordance for link-driven types (bible_study, playlist,
// gallery_album) but visual noise for announcements and events.
func buildPayload(post model.Post) Payload {
	p := Payload{
		Username:  envOrDefault("DISCORD_WEBHOOK_USERNAME", defaultUsername),
		AvatarURL: envOrDefault("DISCORD_WEBHOOK_AVATAR_URL", defaultAvatarURL),
	}

	switch post.Type {
	case model.PostTypeAnnouncement, model.PostTypeEvent:
		p.Content = truncate(buildTitleBodyContent(post), maxContentLength)
	default:
		p.Embeds = []Embed{buildEmbed(post)}
	}
	return p
}

// buildTitleBodyContent serializes the post to Discord markdown. The body is
// stored as Tiptap HTML; HTMLToDiscordMarkdown converts it to plain markdown
// so Discord renders it correctly instead of showing raw HTML tags.
func buildTitleBodyContent(post model.Post) string {
	var b strings.Builder
	fmt.Fprintf(&b, "**%s**", post.Title)
	if post.Body != nil && *post.Body != "" {
		b.WriteString("\n")
		b.WriteString(HTMLToDiscordMarkdown(*post.Body))
	}
	return b.String()
}

// envOrDefault keeps the optional identity vars truly optional - admins can
// rotate username/avatar via the systemd env file, but a fresh deploy without
// those vars set still produces a usable message.
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// truncate counts codepoints rather than bytes because Discord enforces its
// 2000-character cap on codepoints; a byte-based check would over-truncate
// strings that contain multi-byte runes like "📅" (4 bytes, 1 character).
func truncate(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	suffix := []rune(truncationSuffix)
	return string(runes[:maxRunes-len(suffix)]) + truncationSuffix
}

// buildEmbed handles the post types still on rich cards. Kept until those
// types are migrated, so the switch in buildPayload doesn't have to fan out
// inline.
func buildEmbed(post model.Post) Embed {
	embed := Embed{
		Color:     colorByType[post.Type],
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	switch post.Type {
	case model.PostTypeBibleStudy:
		embed.Title = "\U0001f4d6 " + post.Title
		embed.Description = "Friday Bible study materials are posted."
		if post.ExternalLink != nil {
			embed.URL = *post.ExternalLink
		}
		embed.Footer = EmbedFooter{Text: "Click the link to open the slides"}

	case model.PostTypePlaylist:
		embed.Title = "\U0001f3b5 " + post.Title
		embed.Description = "Worship playlist is up!"
		if post.ExternalLink != nil {
			embed.URL = *post.ExternalLink
		}
		embed.Footer = EmbedFooter{Text: "Open in Spotify"}

	case model.PostTypeGalleryAlbum:
		embed.Title = "\U0001f4f8 " + post.Title
		embed.Description = fmt.Sprintf("New photos from %s are up on the website.", post.Title)
		embed.Footer = EmbedFooter{Text: "View album on website"}
	}

	return embed
}
