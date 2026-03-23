package discord

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

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

type Payload struct {
	Embeds []Embed `json:"embeds"`
}

var webhookEnvKeys = map[model.PostType]string{
	model.PostTypeEvent:        "DISCORD_WEBHOOK_EVENTS",
	model.PostTypeAnnouncement: "DISCORD_WEBHOOK_ANNOUNCEMENTS",
	model.PostTypeBibleStudy:   "DISCORD_WEBHOOK_BIBLE_STUDIES",
	model.PostTypePlaylist:     "DISCORD_WEBHOOK_PLAYLISTS",
	model.PostTypeGalleryAlbum: "DISCORD_WEBHOOK_GALLERY",
}

var colorByType = map[model.PostType]int{
	model.PostTypeEvent:        5793266,  // #5865F2 blurple
	model.PostTypeAnnouncement: 5763719,  // #57F287 green
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

	embed := buildEmbed(post)
	payload := Payload{Embeds: []Embed{embed}}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal discord payload: %w", err)
	}

	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to send discord webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord webhook returned status %d", resp.StatusCode)
	}

	return nil
}

func buildEmbed(post model.Post) Embed {
	embed := Embed{
		Color:     colorByType[post.Type],
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	switch post.Type {
	case model.PostTypeEvent:
		embed.Title = post.Title
		if post.Body != nil {
			embed.Description = *post.Body
		} else {
			embed.Description = "(No description \u2014 check website for details)"
		}
		footer := "Posted by admin"
		if post.EventDate != nil {
			footer = fmt.Sprintf("\U0001f4c5 %s \u2022 %s", post.EventDate.Format("January 2, 2006"), footer)
		}
		embed.Footer = EmbedFooter{Text: footer}

	case model.PostTypeAnnouncement:
		embed.Title = "\U0001f4e2 " + post.Title
		if post.Body != nil {
			embed.Description = *post.Body
		}
		embed.Footer = EmbedFooter{Text: "Posted on website"}

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
