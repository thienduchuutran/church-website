# docs/agents/discord.md - Discord Webhook Reference

## Overview
When an admin creates a post on the website, the Go backend posts it to the matching Discord
channel as a **single plain message** that appears under **that admin's own Discord name and
avatar** - so it looks like the admin typed it in Discord themselves. Editing or deleting the
post on the site updates or removes that same Discord message.

Delivery is **best-effort and one-way** (website -> Discord). A Discord failure logs and is
ignored - it never fails the admin's create/edit/delete. There is no reverse sync.

Key idea: a Discord **webhook** can override `username` and `avatar_url` **per message**, so one
webhook per channel serves every admin under their own identity. (A bot has one fixed identity,
so it is the wrong tool here.) Webhooks can also edit and delete their own messages by id.

---

## Channel mapping

| Post type | Discord channel | Env variable (the `discord_channel_key` stored on the post) |
|-----------|----------------|--------------|
| `event` | #events | `DISCORD_WEBHOOK_EVENTS` |
| `announcement` | #announcements | `DISCORD_WEBHOOK_ANNOUNCEMENTS` |
| `bible_study` | #friday-bible-studies | `DISCORD_WEBHOOK_BIBLE_STUDIES` |
| `playlist` | #worship-playlist | `DISCORD_WEBHOOK_PLAYLISTS` |
| `gallery_album` | #memories | `DISCORD_WEBHOOK_GALLERY` |

The **env var name** (not the URL) is saved on the post as `discord_channel_key` when the
message is sent. Edit/delete resolve the webhook from that stored key, so they always hit the
same channel even if this mapping is changed later.

### How to get a webhook URL
Discord -> right-click channel -> Edit Channel -> Integrations -> Webhooks -> New Webhook ->
copy URL -> paste into the matching env var. Repeat per channel.

---

## Message format - plain content for every type (no embeds)

There are **no embeds**. Every post type renders as one plain-text message built by
`discord.BuildContent(post)`:

```
**{title}**
{body converted from Tiptap HTML to Discord markdown, if present}
{external_link on its own line, if present}
```

The bare `external_link` lets Discord **auto-unfurl** its own preview card (Spotify, Google
Slides, YouTube, etc.), which is why `playlist`/`bible_study` no longer need a hand-built embed.
Content is truncated to Discord's 2000-codepoint limit.

Tiptap HTML -> markdown conversion lives in `serializer.go` (`HTMLToDiscordMarkdown`): headings,
bold/italic/underline/strike, links, lists, blockquotes, code, and the callout blocks.

### Inline body images -> attachments (text then images)
Inline `<img>` in a post body are **stripped from the text** and sent as **file attachments**, so a
Discord message reads as **text, then images below it** (option a). Discord cannot interleave images
between paragraphs like the website does, so exact positioning is a website-only capability.

- `serializer.go` drops `<img>` from the text; `ExtractImageURLs(html)` collects the srcs in order.
- `attachments.go` `FilesFromURLs` downloads each image from its public R2 URL and attaches it.
- Cap of **10** attachments per message (Discord's limit) - extra images stay on the website only.
- Best-effort: an image that fails to download is skipped; sent on **create**, images are fixed on edit.

---

## Per-admin identity

`discord.IdentityForAdmin(admin)` decides the `username` + `avatar_url` for each message:

- **Linked admin** -> their Discord username + avatar (stored on the `admins` row).
- **Unlinked admin** -> their `display_name` (or the default church username) + the default
  church avatar. Posting always works whether or not the admin has linked Discord.

Identity is resolved at **send** time by the admin's email (on the request context from
`RequireAdmin`). Discord **ignores** username/avatar on an *edit*, so identity is fixed when the
message is first sent - that is expected and fine.

---

## One-time "Link Discord" OAuth flow (scope: `identify`)

Admins sign in with Google, which cannot supply a Discord handle, so each admin links Discord
once:

1. `GET /api/v1/admin/discord/link` (**admin-only**) - the frontend calls this *with* the Bearer
   token and gets back `{ "url": "<discord consent URL>" }`, then sends the browser there. We
   return a URL instead of redirecting because a top-level browser navigation cannot carry the
   token. The URL's `state` is an HMAC-signed token embedding the admin's email.
2. The admin consents on Discord.
3. `GET /api/v1/admin/discord/callback` (**PUBLIC**) - Discord redirects the browser here. There
   is no Bearer token on a redirect, so this route **must stay public**; trust comes entirely
   from the signed `state`. The handler verifies the state, exchanges the `code` for a token,
   calls `GET /users/@me`, builds the avatar URL from `id` + avatar hash
   (`https://cdn.discordapp.com/avatars/{id}/{hash}.png`, `.gif` for animated), stores
   `discord_user_id` / `discord_username` / `discord_avatar_url` on the admin row, and redirects
   to `{FRONTEND_ORIGIN}/admin?discord=linked` (or `?discord=error`).
4. `GET /api/v1/admin/discord/status` (**admin-only**) - `{ linked, discord_username,
   discord_avatar_url }`, used by the composer to show the linked state or a link nudge.

> Security: the public callback is intentional. Do **not** move it inside `RequireAdmin` - that
> breaks OAuth. The HMAC-signed, 10-minute-expiry `state` is what proves which admin is linking.

### Mentions / @everyone
`allowed_mentions` defaults to `{"parse": []}` - every mention is suppressed, so stray
`@everyone`/`@role` text in a body never pings. The per-post **"Notify @everyone"** checkbox
flips it to `{"parse": ["everyone"]}` and prefixes the content with `@everyone `.

---

## Database columns (migration `000006`)

`admins`: `discord_user_id`, `discord_username`, `discord_avatar_url` (all nullable).
`posts`: `discord_message_id` (the id Discord returns on send), `discord_channel_key` (the
webhook env key used). Both nullable - null until a post is delivered to Discord.

---

## Code map

| File | Responsibility |
|---|---|
| `internal/discord/identity.go` | `IdentityForAdmin` - per-admin sender with unlinked fallback |
| `internal/discord/mentions.go` | `AllowedMentions`, `NoMentions()`, `EveryoneMention()` |
| `internal/discord/send.go` | `Send` (POST `?wait=true`, returns message id), `Edit` (PATCH by id), `Delete` (DELETE by id; 404 = already gone) |
| `internal/discord/webhook.go` | channel mapping, `WebhookForType`/`WebhookByKey`, `BuildContent`, truncation, default identity |
| `internal/discord/serializer.go` | `HTMLToDiscordMarkdown` (Tiptap HTML -> Discord markdown) |
| `internal/discord/oauth.go` | `AuthorizeURL`, `ExchangeCode`, `FetchUser`, `OAuthConfigured` |
| `internal/discord/state.go` | `SignState` / `VerifyState` (HMAC-SHA256, 10-min TTL) |
| `internal/service/posts.go` | orchestration: resolve identity -> send -> persist id (create); edit; read-ref-then-delete |
| `internal/handler/discord_oauth.go` | `LinkStart` / `Status` (admin-only), `Callback` (public) |

## Delivery contract (in `service/posts.go`)

- **Create**: after the post saves, a detached goroutine resolves identity, sends with
  `?wait=true`, and persists `discord_message_id` + `discord_channel_key`. Uses a background
  context (the request context is gone once the handler returns).
- **Update**: if the post has a `discord_message_id`, edits that message's content.
- **Delete**: reads the ref *before* deleting the row, then deletes the Discord message.
- All three: log on failure, never fail the website request.

---

## Environment variables

| Var | Purpose |
|---|---|
| `DISCORD_WEBHOOK_*` (5, see table) | per-channel webhook URLs |
| `DISCORD_OAUTH_CLIENT_ID` / `DISCORD_OAUTH_CLIENT_SECRET` | Discord app credentials for the link flow |
| `DISCORD_OAUTH_REDIRECT_URI` | must equal the `/api/v1/admin/discord/callback` URL registered on the Discord app |
| `DISCORD_OAUTH_STATE_SECRET` | HMAC secret for the signed OAuth `state` |
| `FRONTEND_ORIGIN` | base URL the callback redirects back to (reused from CORS) |

When the OAuth vars are unset the link flow returns `503` and the rest of the app is unaffected;
when a webhook var is unset, that type's posts simply skip Discord delivery (logged).
