# API Reference

Base URL: `http://localhost:8080` (dev) / `https://<render-app>.onrender.com` (prod)  
All routes are prefixed `/api/v1/`.  
All request and response bodies are `application/json`.  
Errors always return `{ "error": "human-readable message" }`.

---

## Public endpoints (no auth required)

### `GET /api/v1/health`
Liveness check.

**Response `200`**
```json
{ "status": "ok" }
```

---

### `GET /api/v1/posts`
List posts. Supports optional filtering.

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | — | Filter by post type: `event`, `announcement`, `bible_study`, `playlist`, `gallery_album` |
| `limit` | int | 20 | Max results |
| `offset` | int | 0 | Pagination offset |

**Response `200`** — array of Post objects (see [Models](#models))

---

### `GET /api/v1/posts/:id`
Single post with images and reaction counts.

**Response `200`** — Post object  
**Response `404`** — post not found

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

**Response `204`** — no body  
**Response `400`** — missing fields or invalid emoji

---

### `DELETE /api/v1/reactions/:post_id`
Remove a reaction by fingerprint.

**Request body**
```json
{ "fingerprint": "browser-uuid" }
```

**Response `204`** — no body  
**Response `400`** — missing fingerprint

---

### `GET /api/v1/pages/:slug`
Returns all editable sections for a static page (e.g. `about`, `connect`).

**Response `200`**
```json
{
  "sections": {
    "hero_title": "About Our Church",
    "hero_subtitle": "Welcome",
    "mission_heading": "Our Mission",
    "mission_body": "..."
  }
}
```
`sections` is always an object (never `null`). Missing keys mean no content has been saved yet — the frontend fills defaults.

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

**Response `204`** — no body
**Response `400`** — missing slug or empty sections
**Response `401` / `403`** — unauthenticated or not an admin

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

**Response `201`** — created Post object  
**Response `400`** — validation error  
**Response `401`** / `403`** — unauthenticated or not an admin

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

**Response `200`** — updated Post object  
**Response `404`** — post not found

---

### `DELETE /api/v1/posts/:id`
Delete a post and its images.

**Response `204`** — no body  
**Response `404`** — post not found

---

### `POST /api/v1/posts/:id/images`
Upload an image file and attach it to a post. The file is stored in S3; only the S3 key is saved in the database. Use `GET /api/v1/posts/:id` to retrieve presigned download URLs.

**Request** — `multipart/form-data`  
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | Image file. Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Max 10 MB. |

**Response `201`**
```json
{ "key": "images/posts/<post-id>/1714000000000.jpg" }
```
Store this key if needed. To display the image, fetch the post — the backend generates a fresh presigned URL on each read.

**Response `400`** — missing file or unsupported content type  
**Response `401` / `403`** — unauthenticated or not an admin  
**Response `500`** — S3 or database failure

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
  "reactions": []
}
```

### PostImage
```json
{
  "id": "uuid",
  "post_id": "uuid",
  "storage_key": "images/posts/<post-id>/1714000000000.jpg",
  "display_order": 0
}
```
`storage_key` is the S3 object key, not a URL. The backend generates a presigned URL on each read — never store the URL on the frontend.

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
> The API never returns raw `PageContent` rows — it returns `{ sections: { key: value, ... } }`. This model is for reference only.

---

## Adding a new endpoint — checklist

1. Write the handler test first (`backend/internal/handler/<feature>_test.go`).
2. Add the method to the repository, then the service, then the handler — never skip a layer.
3. Register the route in `backend/cmd/server/main.go`. Public routes go outside the `RequireAdmin` group.
4. **Update this file** (`docs/api.md`) with the new endpoint, request/response shape, and any new model types.
5. Update `docs/agents/backend.md` route table.
