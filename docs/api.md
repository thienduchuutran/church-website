# API Reference

Base URL: `http://localhost:8080` (dev) / `https://church-website-ff5w.onrender.com` (prod)  
All routes are prefixed `/api/v1/`.  
All request and response bodies are `application/json`.  
Errors always return `{ "error": "human-readable message" }`.

---

## Auth contract - read before adding or moving any route

Every public endpoint below is **intentionally** unauthenticated. Anonymous visitors must be able to browse posts, react, read static pages, and view the calendar without signing in - that is the whole point of a public church website. **Never** wrap any of these `GET`s (or the `/reactions` writes) in `RequireAdmin`; doing so makes the entire site invisible to non-admins. Only mutations on `/posts`, `/pages/:slug`, `/calendar/...`, and image uploads require a JWT.

---

## Localized reads (`?locale=`)

Every read endpoint that returns translatable text accepts an optional `locale` query parameter. Supported values today: `en` (default, source language) and `vi` (Vietnamese).

- When `locale` is missing or `en`, the response is the English source verbatim.
- When `locale` is `vi`, the backend serves translations via a COALESCE join against the `translations` table. Missing translations fall back to English on a per-field basis - the page is never blank, it just shows English for the field whose translation has not landed yet.
- The translation worker fills `translations` rows asynchronously after the admin writes content (~5s typical latency for the first visit; subsequent visits hit the row).
- When a response contains at least one unapproved AI-generated translation, the JSON includes `"machine_translated": true`. The field is omitted on English responses and on responses where every served translation has been human-approved. The frontend reads this to render a subtle "Bản dịch tự động" badge.

Endpoints that honor `locale`:
- `GET /api/v1/posts`
- `GET /api/v1/posts/:id`
- `GET /api/v1/pages/:slug`
- `GET /api/v1/calendar`

> **Not** localized: `GET /api/v1/calendar/event-types`. Type labels are admin-authored English and are not run through the translation pipeline, so a custom category shows its English label on `/vi`. The built-in labels have the same limitation.

See `docs/agents/backend.md` → "Translation engine" and `docs/agents/database.md` → "Translation tables" for the full architecture.

---

## Public endpoints (no auth required - do not protect)

### `GET /api/v1/health`
Liveness check.

**Response `200`**
```json
{ "status": "ok" }
```

---

### `GET /api/v1/posts`
List posts. Supports optional filtering by type and/or tags.

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | - | Filter by post type: `event`, `announcement`, `bible_study`, `playlist`, `gallery_album` |
| `tags` | string | - | Filter gallery_album posts by tag ID (comma-separated UUIDs). Uses OR logic - returns albums with ANY of the selected tags. Ignored when `type` is not `gallery_album`. |
| `limit` | int | 20 | Max results. Server caps at 100. |
| `offset` | int | 0 | Pagination offset |
| `locale` | string | `en` | When `vi`, title and body are served from translations with English fallback. Sets `machine_translated: true` on posts whose translations are unapproved AI output. See [Localized reads](#localized-reads-locale). |

**Response `200`** - array of Post objects (see [Models](#models)). Each post's `images` field is populated when the post has uploaded images. Gallery album posts include a `tags` array with the tags applied to that album. Non-gallery posts have an empty `tags` array.

---

### `GET /api/v1/posts/:id`
Single post with images and reaction counts.

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `locale` | string | `en` | See [Localized reads](#localized-reads-locale). |

**Response `200`** - Post object  
**Response `404`** - post not found

---

### `GET /api/v1/reactions/:post_id`
Returns per-emoji reaction counts and, when a fingerprint is supplied, the caller's own reaction.

**Query params**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `fingerprint` | string | No | Browser UUID from localStorage. When omitted, `my_reaction` is null. |

**Response `200`**
```json
{
  "counts": [
    { "emoji": "👍", "count": 5 },
    { "emoji": "❤️", "count": 2 }
  ],
  "my_reaction": "👍"
}
```
`my_reaction` is `null` when the fingerprint has not reacted or was not provided.  
`counts` is always an array (never `null`).

---

### `POST /api/v1/reactions`
Add or change a reaction (upsert by fingerprint+post).

**Request body**
```json
{
  "post_id": "uuid",
  "emoji": "👍",
  "fingerprint": "browser-uuid"
}
```
Allowed emojis: `👍` `❤️` `🙏` `😂`

**Response `204`** - no body  
**Response `400`** - missing fields or invalid emoji

---

### `DELETE /api/v1/reactions/:post_id`
Remove a reaction by fingerprint.

**Request body**
```json
{ "fingerprint": "browser-uuid" }
```

**Response `204`** - no body  
**Response `400`** - missing fingerprint

---

### `GET /api/v1/calendar`
Returns the events for a given month, plus the optional sidebar note and the optional per-month styling row (accent color).

**Query params**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | int | Yes | 4-digit year, e.g. `2026` |
| `month` | int | Yes | 1–12 |
| `locale` | string | No | When `vi`, event titles + notes and month note content are served from translations. Sets `machine_translated: true` per event / per note when the served value is unapproved AI output. See [Localized reads](#localized-reads-locale). |

**Response `200`**
```json
{
  "events": [ /* CalendarEvent[] */ ],
  "month_note": { /* CalendarMonthNote */ } ,
  "month_settings": { /* CalendarMonthSettings */ }
}
```
`events` is always an array (never `null`). `month_note` and `month_settings` are `null` when the admin has not added a note or customized the accent color for that month.

**Response `400`** - missing or invalid `year` / `month`

---

### `GET /api/v1/calendar/event-types`
Returns the full event-type vocabulary, built-ins first (`sort_order` 10-60) then admin-created ones. Public: the day-events modal needs the labels to name an event's category to visitors.

Since migration `000012` this list is **data, not code** - `calendar_events.event_type` is a text column with a foreign key here, not a Postgres enum, so admins add categories at runtime.

**Response `200`** - `CalendarEventTypeDef[]` (always an array, never `null`)

---

### `POST /api/v1/calendar/event-types`
Create a reusable event type from an admin-typed label. **Admin only.**

**Request body**
```json
{ "label": "Baptism", "default_icon": "star", "default_color": "#2E7D9A" }
```
| Field | Rules |
|---|---|
| `label` | Required, 1-60 chars, must contain at least one letter or number |
| `default_icon` | Must be an allowed icon key, including `"none"` |
| `default_color` | A named palette key **or** a 6-digit hex |

**Get-or-create.** The `slug` is derived server-side from the label (`"Fellowship Meal"` → `fellowship_meal`, diacritics folded so `"Lễ Báp-têm"` → `le_bap_tem`). If that slug already exists the existing row is returned instead of an error, so two admins who both type "Baptism" converge on one type rather than creating near-duplicates.

**Response `201`** - the created (or existing) `CalendarEventTypeDef`  
**Response `400`** - blank/over-long label, or invalid icon/color  
**Response `401` / `403`** - unauthenticated or not an admin

---

### `GET /api/v1/calendar/palette`
Returns the shared custom color swatches admins have saved, in picker order. Public (a list of hex strings).

**Response `200`** - `PaletteColor[]` (always an array, never `null`)

---

### `POST /api/v1/calendar/palette`
Save a custom color as a swatch every admin will see in the picker. **Admin only.**

**Request body**
```json
{ "hex": "#2E7D9A" }
```
`hex` must be a 6-digit hex (`^#[0-9A-Fa-f]{6}$`) - named palette keys are rejected, since those are already built-in swatches. Normalized to uppercase before storing, and idempotent: saving a color that already exists returns the existing swatch.

**Response `201`** - the created (or existing) `PaletteColor`  
**Response `400`** - not a 6-digit hex  
**Response `401` / `403`** - unauthenticated or not an admin

---

### `DELETE /api/v1/calendar/palette/:id`
Remove a saved swatch from the picker. **Admin only.**

Events already using that hex **keep it** - the color is copied onto the event, never referenced - so this only shrinks the picker and never repaints the calendar.

**Response `204`** - deleted  
**Response `404`** - no swatch with that id  
**Response `401` / `403`** - unauthenticated or not an admin

---

### `GET /api/v1/pages/:slug`
Returns all editable content for a static page (e.g. `about`, `connect`). The response contains two projections of the same `page_content` rows:

- **`sections`** — flat key-value map (Connect reads this)
- **`blocks`** — ordered array of typed blocks (About reads this)

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `locale` | string | `en` | When `vi`, each section's content and each block's title+content are served from translations with English fallback. The response includes `machine_translated: true` (page-level boolean) when any returned field is unapproved AI output. See [Localized reads](#localized-reads-locale). |

**Response `200`**
```json
{
  "sections": {
    "hero": "Welcome",
    "mission": "Our mission..."
  },
  "blocks": [
    {
      "id": "uuid",
      "block_type": "hero",
      "position": 0,
      "title": "About Our Church",
      "content": "Welcome",
      "props": {},
      "machine_translated": false
    },
    {
      "id": "uuid",
      "block_type": "rich_text",
      "position": 1,
      "title": "Our Mission",
      "content": "<p>We exist to...</p>",
      "props": {}
    }
  ],
  "machine_translated": true
}
```
`sections` is always an object (never `null`). `blocks` is always an array (never `null`). Missing content means nothing has been saved yet - the frontend fills defaults. `machine_translated` is omitted on English responses and on fully human-approved Vietnamese responses. Per-block `machine_translated` is also omitted when false.

---

### `GET /api/v1/tags`
List all available tags for filtering gallery albums.

**Response `200`** - array of Tag objects (see [Models](#models)), ordered by name.

### `POST /api/v1/assistant/chat`
Ask the AI assistant a question. Powered by the Groq API (llama-3.3-70b-versatile) with RAG context from the church database. Supports optional conversational history.

**Request body**
```json
{
  "message": "When is the next event?",
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hello! I am the VGOMNE Helper. How can I help you today?" }
  ]
}
```
* `message` is required (max 1000 characters).
* `history` is optional and represents the conversation history turns (role must be `user` or `assistant`).

**Response `200`**
```json
{
  "answer": "The next event is Easter Sunday on April 5.",
  "sources": [
    { "id": "uuid", "type": "post", "title": "Easter Sunday" }
  ]
}
```
* `sources` identifies the pieces of database content used by the AI to synthesize its answer.

**Response `400`** - invalid request body, empty message, or message too long  
**Response `429`** - rate limit exceeded (too many requests from the same IP)  
**Response `500`** - LLM inference or RAG search failed  

---

## Admin endpoints (JWT required)

All admin routes require a valid Supabase JWT in the `Authorization: Bearer <token>` header, and the token's email must exist in the `admins` table.

### `PUT /api/v1/pages/:slug`
Update page content. Two mutually exclusive modes:

**Mode 1 — Sections (Connect):** partial upsert of key-value pairs. Only supplied keys are updated; existing keys not in the request body are left unchanged.
```json
{
  "sections": {
    "hero_title": "New Title",
    "mission_body": "Updated mission statement."
  }
}
```

**Mode 2 — Blocks (About):** full replace of the ordered block array. Blocks present in the payload are upserted (by `id`); blocks absent from the payload are deleted (along with their translations and pending translation jobs). New blocks (no `id`) get a server-generated `section_key`.
```json
{
  "blocks": [
    { "block_type": "hero", "title": "About Us", "content": "Welcome", "props": {} },
    { "id": "existing-uuid", "block_type": "rich_text", "title": "Mission", "content": "<p>...</p>", "props": {} },
    { "block_type": "quote", "title": "", "content": "<p>For God so loved...</p>", "props": {"attribution": "John 3:16"} }
  ]
}
```

Validation:
- `blocks: []` → 400 (cannot make a page empty)
- Unknown `block_type` → 400 (allowed: `hero`, `rich_text`, `quote`)
- Empty `block_type` → 400
- If both `sections` and `blocks` are present, `blocks` takes priority

**Response `204`** - no body
**Response `400`** - missing slug, empty sections/blocks, or invalid block_type
**Response `401` / `403`** - unauthenticated or not an admin

---

### `POST /api/v1/posts`
Create a new post.

**Request body**
```json
{
  "type": "event",
  "title": "Easter Sunday",
  "body": "Join us for service.",
  "event_date": "2026-04-05T10:00:00Z",
  "external_link": "https://...",
  "notify_everyone": false
}
```
`event_date` is **optional** even for events - an event created without one shows in the Upcoming section until an admin archives it. All fields except `title` and `type` are optional.
`notify_everyone` (default `false`) opts this post's Discord message into pinging `@everyone`; it is not persisted.

On success the post is delivered to the matching Discord channel as a single message under the
writing admin's own Discord identity (best-effort - a Discord failure never fails this request).
See `docs/agents/discord.md`.

**Response `201`** - created Post object  
**Response `400`** - validation error  
**Response `401`** / `403`** - unauthenticated or not an admin

---

### `PATCH /api/v1/posts/:id`
Edit an existing post. All fields are optional; only supplied fields are updated.

**Request body** (all optional)
```json
{
  "title": "Updated title",
  "body": "Updated body.",
  "event_date": "2026-04-06T10:00:00Z",
  "external_link": "https://..."
}
```

**Response `200`** - updated Post object  
**Response `404`** - post not found

If the post was delivered to Discord, its Discord message content is updated in place (best-effort).
Identity stays as originally sent - Discord ignores username/avatar on edit.

---

### `PATCH /api/v1/posts/:id/archive`
Move an event between the Upcoming and Past sections (admin only). Sets or clears `archived_at`.

**Request body**
```json
{ "archived": true }
```
`true` stamps `archived_at = now()` (moves the event to Past); `false` clears it (back to Upcoming).

**Response `200`** - updated Post object  
**Response `404`** - post not found

This does **not** touch Discord - archiving only changes how the website groups the event, not the message already sent. An event whose `event_date` has passed is shown in Past automatically with no archive needed; this manual flag exists for dateless events and for removing an event from Upcoming early.

---

### `DELETE /api/v1/posts/:id`
Delete a post and its images.

**Response `204`** - no body  
**Response `404`** - post not found

If the post was delivered to Discord, the same Discord message is removed (best-effort).

---

### `POST /api/v1/posts/:id/images`
Upload an image file and attach it to a post. The file is stored in Cloudflare R2 via the S3-compatible API; only the object key is saved in the database. Use `GET /api/v1/posts/:id` to retrieve presigned download URLs.

**Request** - `multipart/form-data`  
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | Image file. Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Max 10 MB. |

**Response `201`**
```json
{ "key": "images/posts/<post-id>/1714000000000.jpg" }
```
Store this key if needed. To display the image, fetch the post - the backend generates a fresh presigned URL on each read.

---

### `POST /api/v1/uploads/image`
Upload an image dropped into the **post body editor** (inline images), and get back its
**permanent public URL** to embed as an `<img>` in the body HTML. Unlike `/posts/:id/images`
this is **not tied to a post** (a new post has no id yet at compose time) and is **not** recorded
in `post_images` - inline images live in the body HTML, not the gallery. Admin only.

**Request** - `multipart/form-data`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | Image file. Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Max 10 MB. |

**Response `201`**
```json
{ "url": "https://<r2-public-host>/images/body/1714000000000.jpg" }
```
Requires `R2_PUBLIC_URL` to be configured - the URL is baked into saved HTML, so a presigned
(expiring) URL would be unusable. Returns `500` when no public URL can be minted.

On create, a post's inline images are also sent to Discord as attachments (see `docs/agents/discord.md`).

**Response `400`** - missing file or unsupported content type  
**Response `401` / `403`** - unauthenticated or not an admin  
**Response `500`** - object storage or database failure

---

### `POST /api/v1/tags`
Create a new tag (label) for gallery albums.

**Request body**
```json
{ "name": "worship" }
```
`name` must be non-empty and unique across all tags.

**Response `201`** - created Tag object (see [Models](#models))  
**Response `400`** - validation error (missing name)  
**Response `401` / `403`** - unauthenticated or not an admin  
**Response `409`** - tag name already exists

---

### `POST /api/v1/posts/:id/tags`
Replace all tags on a gallery album post. Deletes the existing set and inserts the new one.

**Request body**
```json
{ "tag_ids": ["tag-uuid-1", "tag-uuid-2"] }
```
Pass an empty array to remove all tags. Tag IDs must be valid tag UUIDs.

**Response `204`** - no body  
**Response `400`** - validation error (malformed tag IDs)  
**Response `401` / `403`** - unauthenticated or not an admin  
**Response `500`** - database error

---

### `DELETE /api/v1/posts/:id/tags/:tag_id`
Remove a single tag from a gallery album post.

**Response `204`** - no body  
**Response `401` / `403`** - unauthenticated or not an admin  
**Response `404`** - tag not assigned to post  
**Response `500`** - database error

---

### `GET /api/v1/admin/translations`
List translations for the admin review panel. Admin only.

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `locale` | string | (all) | Filter to one locale, e.g. `vi`. |
| `approved` | `true` \| `false` | (all) | Tri-state. Omit for "All" tab. `false` returns translations still needing review (`approved_by IS NULL`). `true` returns human-approved translations. |
| `limit` | int | 20 | Page size. Server caps at 100. |
| `offset` | int | 0 | Pagination offset. |

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid",
      "table_name": "posts",
      "record_id": "uuid",
      "field_name": "title",
      "locale": "vi",
      "source_text": "Easter Sunday Service",
      "translated_text": "Lễ Phục Sinh",
      "is_ai_generated": true,
      "approved_by": null,
      "approved_at": null,
      "created_at": "2026-05-22T10:00:00Z",
      "updated_at": "2026-05-22T10:00:00Z",
      "record_title": "Easter Sunday Service"
    }
  ],
  "total": 42
}
```
`record_title` is synthesized at query time by joining to the parent table and producing a human label:
- `posts` → the post's `title`
- `page_content` → `"<page_slug> / <section_key>"`
- `calendar_events` → `"<title> · <date>"`
- `calendar_month_notes` → `"Month note · YYYY-MM"`
- orphaned (parent row deleted) → `"<table_name>:<short uuid>"`

---

### `PATCH /api/v1/admin/translations/:id`
Approve a translation. Admin only. Sets `approved_by` to the caller's JWT `sub` and `approved_at` to `now()`.

**Request body** (all optional)
```json
{ "translated_text": "Lễ Phục Sinh (edited)" }
```
- Omit `translated_text` → approves the existing AI output **as-is**. `is_ai_generated` stays `true`.
- Include `translated_text` → updates the text AND sets `is_ai_generated = false`. The human owns this text now.

**Response `200`** - the updated Translation object  
**Response `404`** - translation id not found

---

### `POST /api/v1/admin/translations/retranslate/:id`
Re-translate. Admin only. Deletes the existing `translations` row so the public read path's COALESCE falls back to English while the worker produces a fresh one, then enqueues a `translation_jobs` row with the same source_text and locale. Use case: the system prompt was edited and you want existing translations refreshed against the new prompt.

**Response `202` Accepted** - returns the (now-deleted) source metadata so the frontend can update its UI immediately. The new translated text will not exist until the worker drains the queue (~5s).  
**Response `404`** - translation id not found

---

### `POST /api/v1/admin/translations/retranslate-all`
Bulk version of `retranslate/:id`. Admin only. Deletes **every unapproved** translation (`approved_by IS NULL`) and re-enqueues each as a fresh `translation_jobs` row. Approved (human-reviewed) translations are deliberately left untouched.

Use case: you just ran `scripts/sync-prompt.sh` to push a new system prompt version and want every pending translation rebuilt against it. The running backend's `PromptCache` (5-minute TTL) means the worker picks up the new prompt on its next refresh - no redeploy.

**Request body** — empty.

**Response `202` Accepted**
```json
{ "requeued": 47 }
```

The new translated text exists only after the worker drains the queue (~5s per job). Public reads return English via COALESCE during the gap.

---

### `POST /api/v1/admin/translations/cleanup-orphans`
Orphan sweep. Admin only. Deletes `translations` rows whose parent record (post, page section, calendar event, month note) no longer exists, plus `pending` queue jobs pointing at those dead records (without this, the worker would re-create the orphan ~5s after the sweep). Orphans appear in the review panel with `posts:a1b2c3d4`-style labels.

Safety properties:
- Only the four known `table_name` values are swept; rows with an unrecognized `table_name` (e.g. a future content type) are never touched.
- `done`/`failed` jobs are kept as audit history.
- `fine_tuning_examples` is never touched - captured training pairs intentionally survive parent deletion.

**Request body** — empty.

**Response `200` OK** (synchronous - counts are final when the response returns)
```json
{ "deleted_translations": 3, "deleted_jobs": 1 }
```

---

### `PUT /api/v1/calendar/months/:year/:month/settings`
Upsert the per-month styling row. Currently a single field (`accent_color`); the row also stores the `admin_id` of the most recent editor for audit. The accent tints the day-of-week header, month title, and "today" marker on every visitor's view of that month.

**Request body**
```json
{ "accent_color": "#C4663C" }
```
`accent_color` must be a 6-digit hex color (`^#[0-9A-Fa-f]{6}$`). Anything else is rejected with 400.

**Response `200`** - saved `CalendarMonthSettings` object  
**Response `400`** - invalid year/month or invalid hex color  
**Response `401` / `403`** - unauthenticated or not an admin

---

### `GET /api/v1/admin/discord/link`
Start the one-time Discord account link. Call **with** the Bearer token; returns the Discord
consent URL, which the frontend then navigates the browser to. (A URL is returned rather than a
redirect because a top-level browser navigation can't carry the token.)

**Response `200`** - `{ "url": "https://discord.com/api/oauth2/authorize?..." }`  
**Response `503`** - Discord OAuth is not configured (env vars unset)

---

### `GET /api/v1/admin/discord/status`
Whether the current admin has linked Discord, for the composer's "posts as ..." note / nudge.

**Response `200`** - `{ "linked": true, "discord_username": "pastorminh", "discord_avatar_url": "https://cdn.discordapp.com/avatars/.../...png" }` (the two `discord_*` fields are omitted when `linked` is `false`)

---

### `GET /api/v1/admin/discord/callback`
**PUBLIC** (outside the admin group). Discord redirects the browser here after consent; it carries
no Bearer token, so trust comes from the HMAC-signed `state`. Verifies the state, exchanges the
`code`, reads `/users/@me`, stores the Discord identity on the admin row, and redirects.

**Query** - `code`, `state` (or `error` if the user declined)  
**Response `303`** - redirect to `{FRONTEND_ORIGIN}/admin?discord=linked` (or `?discord=error`)

See `docs/agents/discord.md` for the full flow and the security rationale.

---

## Models

### Post
```json
{
  "id": "uuid",
  "type": "event",
  "title": "Easter Sunday",
  "body": "Join us.",
  "event_date": "2026-04-05T10:00:00Z",
  "external_link": null,
  "admin_id": "uuid",
  "created_at": "2026-04-01T00:00:00Z",
  "updated_at": "2026-04-01T00:00:00Z",
  "archived_at": null,
  "images": [],
  "reactions": [],
  "tags": [],
  "machine_translated": true
}
```
`admin_id` is the **Supabase JWT `sub` claim** (auth user UUID), not a foreign key to `admins.id`. There is no FK on this column on purpose - see [`backend/migrations/000001_initial_schema.up.sql`](../backend/migrations/000001_initial_schema.up.sql) and `docs/agents/known-quirks.md` if a `posts_admin_id_fkey` ever reappears.  
`tags` is populated only for `gallery_album` posts; other post types have an empty array.
`event_date` is **nullable even for events** - an event with no date shows in the Upcoming section until an admin archives it. `archived_at` is a timestamp set when an admin manually moves an event into the Past section, `null` otherwise; it is always present (never omitted). Combined with `event_date` it decides whether an event renders as Upcoming or Past - see the `PATCH /posts/:id/archive` endpoint and `docs/agents/database.md`.
`machine_translated` is **omitted** from the JSON unless the response is in a non-English locale AND at least one served field (title or body) was an unapproved AI translation. See [Localized reads](#localized-reads-locale).

### PostImage
```json
{
  "id": "uuid",
  "post_id": "uuid",
  "storage_key": "images/posts/<post-id>/1714000000000.jpg",
  "storage_url": "https://<account-id>.r2.cloudflarestorage.com/church-uploads-prod/images/posts/<post-id>/1714000000000.jpg?X-Amz-...",
  "display_order": 0
}
```
`storage_key` is the canonical object key (same format whether the bytes live in AWS S3 or Cloudflare R2). `storage_url` is a freshly-presigned download URL (≈1 hour TTL) regenerated on every list/get response. Always render images from `storage_url`; never store it long-term - it expires. `storage_url` is omitted when the backend was started without object-storage credentials.

### ReactionCount
```json
{ "emoji": "👍", "count": 5 }
```

### ReactionSummary
```json
{
  "counts": [{ "emoji": "👍", "count": 5 }],
  "my_reaction": "👍"
}
```

### Tag
```json
{
  "id": "uuid",
  "name": "worship",
  "created_at": "2026-04-01T00:00:00Z"
}
```
Tags are reusable labels created by admins and can be applied to multiple gallery album posts. The `created_at` field shows when the tag was first created.

### CalendarEvent
```json
{
  "id": "uuid",
  "date": "2026-05-22",
  "end_date": "2026-05-25",
  "title": "Youth Camp",
  "event_type": "general",
  "icon": "star",
  "private_address": "123 Main St",
  "address_public": false,
  "color": "sky",
  "notes": "Bring your study guide.",
  "admin_id": "uuid",
  "created_at": "2026-04-01T00:00:00Z",
  "updated_at": "2026-04-01T00:00:00Z",
  "machine_translated": true
}
```
`date` is a `YYYY-MM-DD` string (no time component) - the first day of the event. `end_date` is the inclusive last day of a multi-day span (also `YYYY-MM-DD`); it is **omitted/null for a single-day event**, and when set must be `>= date` (enforced by request validation and a DB `CHECK`). A multi-day event renders as a banner ribbon spanning its days, and the month query returns it for **every** month its range overlaps (a span crossing a month boundary appears in both). `event_type` is a **slug from the `calendar_event_types` table**, not a fixed enum - the six built-ins are `birthday`, `bible_study`, `general`, `announcement`, `prayer`, `graduation`, and admins create more at runtime via `POST /api/v1/calendar/event-types`. Request validation only checks shape (`^[a-z0-9_]{1,40}$`); existence is enforced by the foreign key and a pre-flight check in the service. `icon` is a Phosphor icon key (one of: `cake`, `book-open`, `bell`, `heart`, `star`, `users`, `music-notes`, `cross`, `flame`, `sparkle`, `graduation-cap`) **or `none`**, which renders the event with no icon at all. `color` is either a named palette key (`slate`, `red`, `amber`, `emerald`, `sky`, `violet`, `rose`, `stone`, `black`) **or a 6-digit hex** like `#2E7D9A`. Named keys carry hand-tuned tints; a hex is expanded client-side by `deriveRamp` (`frontend/lib/color.ts`) into the same four values, with the derived text color guaranteed to clear WCAG AA against both white and its own highlight tint. `private_address` is returned to admins always, and to the public **only when `address_public` is `true`**; otherwise public viewers see `null` even when an address exists. `address_public` defaults to `false` (privacy-safe). The PNG export is admin-driven, so it always includes the address regardless of this flag. `machine_translated` follows the same rule as on Post.

### CalendarMonthNote
```json
{
  "id": "uuid",
  "year": 2026,
  "month": 5,
  "content": "May focus: gratitude. Bring guests on Sunday.",
  "admin_id": "uuid",
  "created_at": "2026-05-01T00:00:00Z",
  "updated_at": "2026-05-01T00:00:00Z",
  "machine_translated": true
}
```
Sidebar note attached to a (`year`, `month`) pair. Returned on `GET /api/v1/calendar` as `month_note`; `null` when no row exists for that month. `machine_translated` follows the same rule as on Post.

### CalendarMonthSettings
```json
{
  "id": "uuid",
  "year": 2026,
  "month": 5,
  "accent_color": "#C4663C",
  "admin_id": "uuid",
  "created_at": "2026-05-04T00:00:00Z",
  "updated_at": "2026-05-04T00:00:00Z"
}
```
Per-month admin styling for the calendar. `accent_color` is a 6-digit hex string. Returned on `GET /api/v1/calendar` as `month_settings`; absent (`null`) when no row exists for that month - the frontend then falls back to its static `MONTH_THEMES` palette.

### CalendarEventTypeDef
```json
{
  "slug": "baptism",
  "label": "Baptism",
  "default_icon": "star",
  "default_color": "#2E7D9A",
  "is_builtin": false,
  "sort_order": 100,
  "admin_id": "uuid",
  "created_at": "2026-07-28T00:00:00Z",
  "updated_at": "2026-07-28T00:00:00Z"
}
```
One row of the admin-managed event-type vocabulary (table `calendar_event_types`, added in migration `000012`). `slug` is the primary key and is what `CalendarEvent.event_type` points at via a foreign key (`ON UPDATE CASCADE ON DELETE RESTRICT`).

`default_icon` / `default_color` are the look a new event of this type starts with - selecting a type chip in the event modal applies them. They live here rather than in the frontend so an admin-created type feels designed from its first use.

`is_builtin` marks the six types the application code still branches on (`birthday` drives the cake marker, the two-row cell budget in `CalendarGrid`, and the Birthdays sidebar strip), so a future delete feature can protect them.

### PaletteColor
```json
{
  "id": "uuid",
  "hex": "#2E7D9A",
  "sort_order": 0,
  "admin_id": "uuid",
  "created_at": "2026-07-28T00:00:00Z"
}
```
One saved swatch in the shared custom color palette (table `calendar_palette_colors`). Deliberately **unnamed** - the color is its own label, following GoodNotes rather than Outlook categories.

`hex` is `UNIQUE` with a DB `CHECK (hex ~ '^#[0-9A-Fa-f]{6}$')`. That CHECK is a security backstop, not just hygiene: the value is rendered into an inline `style` attribute on the public calendar.

Swatches are a **picker convenience only**. An event stores its color by value, so deleting a swatch never repaints an existing event.

### PageContent
```json
{
  "id": "uuid",
  "page_slug": "about",
  "section_key": "hero",
  "content": "Welcome",
  "updated_at": "2026-04-09T00:00:00Z"
}
```
> The API never returns raw `PageContent` rows - it returns `{ sections, blocks }`. This model is for reference only.

### PageBlock
```json
{
  "id": "uuid",
  "block_type": "rich_text",
  "position": 1,
  "title": "Our Mission",
  "content": "<p>We exist to serve...</p>",
  "props": {},
  "machine_translated": false
}
```
`block_type` is one of `hero`, `rich_text`, `quote`. Validated server-side - the handler rejects any unknown type. `position` is the 0-based order of the block on the page. `title` is the block heading (rendered as `<h2>`). `content` is sanitized HTML (same rules as post bodies). `props` is a JSON object for type-specific config (e.g. `{"attribution": "John 3:16"}` for `quote` blocks) - never prose, never translated. `machine_translated` is per-block, omitted when false.

### AssistantMessage
```json
{
  "role": "user",
  "content": "Hello"
}
```

### AssistantSource
```json
{
  "id": "uuid",
  "type": "post",
  "title": "Easter Sunday"
}
```

---

## Adding a new endpoint - checklist

1. Write the handler test first (`backend/internal/handler/<feature>_test.go`).
2. Add the method to the repository, then the service, then the handler - never skip a layer.
3. Register the route in `backend/cmd/server/main.go`. Public routes go outside the `RequireAdmin` group.
4. **Update this file** (`docs/api.md`) with the new endpoint, request/response shape, and any new model types.
5. Update `docs/agents/backend.md` route table.
