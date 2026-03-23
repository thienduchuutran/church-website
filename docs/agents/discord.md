# docs/agents/discord.md — Discord Webhook Reference

## Overview
When an admin creates a new post on the website, the Go backend automatically fires a Discord webhook
to the matching channel. The webhook posts a clean, public-safe summary. The admin can then
open Discord and edit the post to add private details (names, Venmo, parking info, etc.).

Webhooks are **one-way**: website → Discord. There is no reverse sync.

---

## Channel mapping

| Post type | Discord channel | Env variable |
|-----------|----------------|--------------|
| `event` | #events | `DISCORD_WEBHOOK_EVENTS` |
| `announcement` | #announcements | `DISCORD_WEBHOOK_ANNOUNCEMENTS` |
| `bible_study` | #friday-bible-studies | `DISCORD_WEBHOOK_BIBLE_STUDIES` |
| `playlist` | #worship-playlist | `DISCORD_WEBHOOK_PLAYLISTS` |
| `gallery_album` | #memories | `DISCORD_WEBHOOK_GALLERY` |

---

## How to get a webhook URL for a Discord channel
1. Open Discord → right-click the channel → Edit Channel
2. Integrations → Webhooks → New Webhook
3. Give it a name (e.g. "Church Website") and copy the webhook URL
4. Paste it into `backend/.env` as the matching env variable above
5. Repeat for each channel

---

## Webhook payload format
Discord webhooks accept a JSON POST with a `content` field (plain text) or `embeds` array (rich cards).
We use embeds for a cleaner look.

```go
// internal/discord/webhook.go

type DiscordEmbed struct {
    Title       string `json:"title"`
    Description string `json:"description,omitempty"`
    URL         string `json:"url,omitempty"`
    Color       int    `json:"color"` // decimal color value
    Footer      struct {
        Text string `json:"text"`
    } `json:"footer"`
    Timestamp string `json:"timestamp"` // ISO 8601
}

type DiscordPayload struct {
    Embeds []DiscordEmbed `json:"embeds"`
}
```

---

## Color values by post type (decimal)
| Post type | Color (hex) | Color (decimal) |
|-----------|-------------|-----------------|
| event | #5865F2 (Discord blurple) | 5793266 |
| announcement | #57F287 (green) | 5763719 |
| bible_study | #FEE75C (yellow) | 16711516 |
| playlist | #1DB954 (Spotify green) | 1948500 |
| gallery_album | #EB459E (pink) | 15418270 |

---

## Message format per type

**event:**
```
Title: {post.title}
Description: {post.body if present, else "(No description — check website for details)"}
URL: https://your-site.com/events
Footer: 📅 {formatted event_date} • Posted by admin
```

**announcement:**
```
Title: 📢 {post.title}
Description: {post.body}
Footer: Posted on website
```

**bible_study:**
```
Title: 📖 {post.title}
Description: Friday Bible study materials are posted.
URL: {post.external_link}  ← the Google Slides/Docs link
Footer: Click the link to open the slides
```

**playlist:**
```
Title: 🎵 {post.title}
Description: Worship playlist is up!
URL: {post.external_link}  ← Spotify link
Footer: Open in Spotify
```

**gallery_album:**
```
Title: 📸 {post.title}
Description: New photos from {post.title} are up on the website.
URL: https://your-site.com/gallery
Footer: View album on website
```

---

## SendToDiscord function signature

```go
// internal/discord/webhook.go
func SendToDiscord(postType model.PostType, post model.Post) error
```

Called from `internal/service/posts.go` after a post is successfully saved to the database.
If the webhook fails, log the error but do NOT fail the whole request — the post was saved successfully,
the Discord message is best-effort.

---

## Error handling rule
```go
if err := discord.SendToDiscord(post.Type, post); err != nil {
    log.Printf("discord webhook failed for post %s: %v", post.ID, err)
    // do not return error — post creation still succeeded
}
```
