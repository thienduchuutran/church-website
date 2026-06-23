package discord

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// Identity defaults applied when an admin has not linked Discord. The same
// shared webhook URL can post under any name/avatar (overridden per message),
// so these are only the fallback sender for unlinked admins.
const (
	defaultUsername  = "VGOMNE"
	defaultAvatarURL = "https://cdn.discordapp.com/embed/avatars/0.png"
)

// Discord rejects messages over 2000 codepoints; truncating with an ellipsis
// degrades gracefully instead of dropping the notification entirely.
const (
	maxContentLength = 2000
	truncationSuffix = "..."
)

// httpClient bounds the wait on Discord's endpoints. Sends happen in detached
// goroutines from the post service, so without a timeout a hung Discord request
// would leak the goroutine for the lifetime of the process.
var httpClient = &http.Client{Timeout: 10 * time.Second}

// webhookEnvKeys maps each post type to the env var holding that channel's
// webhook URL. The KEY (not the URL) is stored on the post as
// discord_channel_key so edit/delete can resolve the same webhook later, even
// if this mapping is changed afterwards.
var webhookEnvKeys = map[model.PostType]string{
	model.PostTypeEvent:        "DISCORD_WEBHOOK_EVENTS",
	model.PostTypeAnnouncement: "DISCORD_WEBHOOK_ANNOUNCEMENTS",
	model.PostTypeBibleStudy:   "DISCORD_WEBHOOK_BIBLE_STUDIES",
	model.PostTypePlaylist:     "DISCORD_WEBHOOK_PLAYLISTS",
	model.PostTypeGalleryAlbum: "DISCORD_WEBHOOK_GALLERY",
}

// WebhookForType returns the webhook URL for a post type plus the env key it
// came from. The env key is stored on the post (discord_channel_key) so a later
// edit/delete reuses exactly this webhook. ok is false when the type has no
// channel configured or the env var is unset - the caller logs and skips
// delivery (best-effort), it does not fail the request.
func WebhookForType(t model.PostType) (url, envKey string, ok bool) {
	envKey, mapped := webhookEnvKeys[t]
	if !mapped {
		return "", "", false
	}
	url = os.Getenv(envKey)
	if url == "" {
		return "", envKey, false
	}
	return url, envKey, true
}

// WebhookByKey resolves a stored channel key (env var name) back to its current
// URL, for editing or deleting a message sent earlier.
func WebhookByKey(envKey string) (url string, ok bool) {
	if envKey == "" {
		return "", false
	}
	url = os.Getenv(envKey)
	return url, url != ""
}

// BuildContent renders a post to the plain-text message body shown in Discord.
// Every post type is plain content now (no embeds): the title in bold, the body
// converted from Tiptap HTML to Discord markdown, and any external link on its
// own line so Discord auto-unfurls it into a preview card (Spotify, Google
// Slides, YouTube, etc.) - which is why link-driven types no longer need an
// embed. The result is truncated to Discord's 2000-codepoint ceiling.
func BuildContent(post model.Post) string {
	var b strings.Builder
	fmt.Fprintf(&b, "**%s**", post.Title)

	if post.Body != nil && *post.Body != "" {
		b.WriteString("\n")
		b.WriteString(HTMLToDiscordMarkdown(*post.Body))
	}

	if post.ExternalLink != nil && *post.ExternalLink != "" {
		b.WriteString("\n")
		b.WriteString(*post.ExternalLink)
	}

	return truncate(b.String(), maxContentLength)
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
