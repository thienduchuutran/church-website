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

### `GET /api/v1/pages/:slug`
Returns all editable sections for a static page (e.g. `about`, `connect`).

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `locale` | string | `en` | When `vi`, each section's content is served from translations with English fallback. The response includes `machine_translated: true` (page-level boolean) when any returned section is unapproved AI output. See [Localized reads](#localized-reads-locale). |

**Response `200`**
```json
{
  "sections": {
    "hero_title": "About Our Church",
    "hero_subtitle": "Welcome",
    "mission_heading": "Our Mission",
    "mission_body": "..."
  },
  "machine_translated": true
}
```
`sections` is always an object (never `null`). Missing keys mean no content has been saved yet - the frontend fills defaults. `machine_translated` is omitted on English responses and on fully human-approved Vietnamese responses.

---

### `GET /api/v1/tags`
List all available tags for filtering gallery albums.

**Response `200`** - array of Tag objects (see [Models](#models)), ordered by name.

---

## Admin endpoints (JWT required)

All admin routes require a valid Supabase JWT in the `Authorization: Bearer <token>` header, and the token's email must exist in the `admins` table.

### `PUT /api/v1/pages/:slug`
Upsert editable sections for a static page. Only supplied keys are updated; existing keys not in the request body are left unchanged.

**Request body**
```json
{
  "sections": {
    "hero_title": "New Title",
    "mission_body": "Updated mission statement."
  }
}
```

**Response `204`** - no body
**Response `400`** - missing slug or empty sections
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
  "external_link": "https://..."
}
```
`event_date` is required when `type` is `event`. All other fields except `title` and `type` are optional.

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

---

### `DELETE /api/v1/posts/:id`
Delete a post and its images.

**Response `204`** - no body  
**Response `404`** - post not found

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
  "images": [],
  "reactions": [],
  "tags": [],
  "machine_translated": true
}
```
`admin_id` is the **Supabase JWT `sub` claim** (auth user UUID), not a foreign key to `admins.id`. There is no FK on this column on purpose - see [`backend/migrations/000001_initial_schema.up.sql`](../backend/migrations/000001_initial_schema.up.sql) and `docs/agents/known-quirks.md` if a `posts_admin_id_fkey` ever reappears.  
`tags` is populated only for `gallery_album` posts; other post types have an empty array.
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
  "date": "2026-05-04",
  "title": "Bible Study",
  "event_type": "bible_study",
  "icon": "book-open",
  "private_address": "123 Main St",
  "color": "sky",
  "notes": "Bring your study guide.",
  "admin_id": "uuid",
  "created_at": "2026-04-01T00:00:00Z",
  "updated_at": "2026-04-01T00:00:00Z",
  "machine_translated": true
}
```
`date` is a `YYYY-MM-DD` string (no time component). `event_type` is one of `birthday`, `bible_study`, `general`, `announcement`, `prayer`. `icon` is a Phosphor icon key (one of: `cake`, `book-open`, `bell`, `heart`, `star`, `users`, `music-notes`, `cross`, `flame`, `sparkle`). `color` is one of `slate`, `red`, `amber`, `emerald`, `sky`, `violet`, `rose`, `stone`. `private_address` is **only returned to authenticated admins** - public viewers see `null` for that field even when an address exists in the database. `machine_translated` follows the same rule as on Post.

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

### PageContent
```json
{
  "id": "uuid",
  "page_slug": "about",
  "section_key": "hero_title",
  "content": "About Our Church",
  "updated_at": "2026-04-09T00:00:00Z"
}
```
> The API never returns raw `PageContent` rows - it returns `{ sections: { key: value, ... } }`. This model is for reference only.

---

## Adding a new endpoint - checklist

1. Write the handler test first (`backend/internal/handler/<feature>_test.go`).
2. Add the method to the repository, then the service, then the handler - never skip a layer.
3. Register the route in `backend/cmd/server/main.go`. Public routes go outside the `RequireAdmin` group.
4. **Update this file** (`docs/api.md`) with the new endpoint, request/response shape, and any new model types.
5. Update `docs/agents/backend.md` route table.
