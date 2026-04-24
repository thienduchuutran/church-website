# docs/agents/backend.md — Go Backend Reference

## Entry point
`backend/cmd/server/main.go` — wires together the router, middleware, database connection, and starts the HTTP server.

## Router
Using `github.com/go-chi/chi/v5`. Lightweight, idiomatic Go, close to Express in feel.

---

## Architecture: handler → service → repository

Every feature follows this strict 3-layer pattern. Never skip a layer.

```
HTTP Request
     ↓
  handler/       ← parse request, validate input, call service, write response
     ↓
  service/       ← business logic, orchestration, calls repository + discord
     ↓
  repository/    ← raw pgx SQL queries, no logic, just data in/out
     ↓
  AWS RDS PostgreSQL
```

**Rule:** A handler must never import `repository`. A repository must never import `service`. Dependencies only flow downward.

---

## Folder structure
```
backend/
├── cmd/server/main.go          ← entry point
├── internal/
│   ├── handler/
│   │   ├── posts.go            ← GET /posts, POST /posts, PATCH /posts/:id, DELETE /posts/:id
│   │   ├── reactions.go        ← POST /reactions, DELETE /reactions
│   │   ├── gallery.go          ← POST /gallery (album + images)
│   │   └── pages.go            ← GET /pages/:slug, PUT /pages/:slug
│   ├── service/
│   │   ├── posts.go            ← CreatePost (saves to DB + fires Discord webhook)
│   │   ├── reactions.go        ← UpsertReaction, DeleteReaction
│   │   ├── gallery.go          ← CreateAlbum, attaches images
│   │   └── pages.go            ← GetPageContent, UpdatePageContent
│   ├── repository/
│   │   ├── posts.go            ← InsertPost, GetPosts, GetPostByID, UpdatePost, DeletePost
│   │   ├── reactions.go        ← UpsertReaction, GetReactionCounts, DeleteReaction
│   │   ├── gallery.go          ← InsertPostImage, GetImagesByPostID
│   │   └── pages.go            ← GetSections, UpsertSections
│   ├── middleware/
│   │   ├── auth.go             ← Verify Supabase JWT → check admins table → attach to ctx
│   │   ├── cors.go             ← Allow frontend origin
│   │   └── logger.go           ← Request logging
│   ├── model/
│   │   └── types.go            ← Post, Admin, Reaction, PostImage structs
│   ├── discord/
│   │   └── webhook.go          ← SendToDiscord(channelType, message)
│   └── storage/
│       └── s3.go               ← S3Client: UploadFile, DeleteFile, PresignedURL (uses EC2 IAM role)
├── pkg/database/
│   └── postgres.go             ← pgx connection pool, returns *pgxpool.Pool
├── .env
├── go.mod
└── Dockerfile
```

---

## API routes

All routes are prefixed `/api/v1/`.

### Public (no auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/posts` | List posts. Query params: `?type=event`, `?limit=20`, `?offset=0` |
| GET | `/api/v1/posts/:id` | Single post with images and reaction counts |
| GET | `/api/v1/reactions/:post_id` | Returns `ReactionSummary` — per-emoji counts + caller's reaction. Optional `?fingerprint=<fp>` query param; when omitted `my_reaction` is null. |
| POST | `/api/v1/reactions` | Add or change a reaction (upsert by fingerprint) |
| DELETE | `/api/v1/reactions/:post_id` | Remove a reaction by fingerprint |
| GET | `/api/v1/pages/:slug` | Returns `{ sections: { key: value } }` for a static page |

> Full request/response shapes and model definitions live in `docs/api.md`.

### Admin only (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/posts` | Create a new post |
| PATCH | `/api/v1/posts/:id` | Edit a post |
| DELETE | `/api/v1/posts/:id` | Delete a post |
| PUT | `/api/v1/pages/:slug` | Upsert sections for a static page |
| POST | `/api/v1/posts/:id/images` | Upload an image to S3 and attach it to a post. Returns `{ key }`. |

---

## Model types (`internal/model/types.go`)

```go
type PostType string

const (
    PostTypeEvent        PostType = "event"
    PostTypeAnnouncement PostType = "announcement"
    PostTypeBibleStudy   PostType = "bible_study"
    PostTypePlaylist     PostType = "playlist"
    PostTypeGalleryAlbum PostType = "gallery_album"
)

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
    Images       []PostImage `json:"images,omitempty"`
    Reactions    []ReactionCount `json:"reactions,omitempty"`
}

type PostImage struct {
    ID           string `json:"id"`
    PostID       string `json:"post_id"`
    StorageURL   string `json:"storage_url"`
    DisplayOrder int    `json:"display_order"`
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

type ReactionSummary struct {
    Counts     []ReactionCount `json:"counts"`
    MyReaction *string         `json:"my_reaction"` // nil when fingerprint absent or no reaction
}

type PageContent struct {
    ID         string    `json:"id"`
    PageSlug   string    `json:"page_slug"`
    SectionKey string    `json:"section_key"`
    Content    string    `json:"content"`
    UpdatedAt  time.Time `json:"updated_at"`
}
```

---

## Error handling convention
Return JSON errors in this shape:
```json
{ "error": "human-readable message" }
```
Use standard HTTP status codes: 400 bad input, 401 unauthenticated, 403 not admin, 404 not found, 500 server error.
Never leak internal error messages or stack traces to the client. Log them server-side only.

---

## Environment variables

All secrets live in the systemd service file on EC2 — there is no `.env` file on the server.
For local development, create `backend/.env` (never commit it).

```
PORT=8080
DATABASE_URL=postgresql://...           # RDS connection string
SUPABASE_URL=https://your-project-id.supabase.co  # used for JWKS endpoint (auth still via Supabase)
SUPABASE_JWT_SECRET=...                 # Supabase JWT secret (fallback for HS256; ES256 uses JWKS)
DISCORD_WEBHOOK_EVENTS=https://...
DISCORD_WEBHOOK_ANNOUNCEMENTS=https://...
DISCORD_WEBHOOK_BIBLE_STUDIES=https://...
DISCORD_WEBHOOK_PLAYLISTS=https://...
DISCORD_WEBHOOK_GALLERY=https://...
FRONTEND_ORIGIN=https://vgomne.ddns.net
AWS_REGION=us-east-1
S3_BUCKET=church-uploads-prod-058264284549-us-east-1-an
```

---

## JWT verification update (ES256 via JWKS)
This project uses Supabase JWTs signed with `ES256` (ECDSA). The middleware now:

- Fetches JWKS from `https://<SUPABASE_URL>/auth/v1/.well-known/jwks.json`
- Caches keyset for 1 hour in `internal/middleware/jwks.go`
- Validates incoming requests by `kid` + public key lookup
- Verifies token method type `SigningMethodECDSA` in `internal/middleware/auth.go`

This is required because old flow using `[]byte(SUPABASE_JWT_SECRET)` only worked for `HS256`.

---

## Key packages
```
github.com/go-chi/chi/v5        ← router
github.com/jackc/pgx/v5         ← Postgres driver
github.com/jackc/pgx/v5/pgxpool ← connection pooling
github.com/aws/aws-sdk-go-v2    ← S3 uploads via EC2 IAM role
github.com/joho/godotenv        ← load .env for local dev only
```
