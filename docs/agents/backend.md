# docs/agents/backend.md - Go Backend Reference

## Entry point
`backend/cmd/server/main.go` - wires together the router, middleware, database connection, and starts the HTTP server.

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
  Supabase Postgres (via session pooler)
```

**Rule:** A handler must never import `repository`. A repository must never import `service`. Dependencies only flow downward.

---

## Folder structure
```
backend/
├── cmd/server/main.go          ← entry point
├── internal/
│   ├── handler/
│   │   ├── posts.go            ← GET /posts, POST /posts, PATCH /posts/:id, PATCH /posts/:id/archive, DELETE /posts/:id (locale-aware reads; depends on a postService interface for testability)
│   │   ├── tag.go              ← GET /tags, POST /tags, POST/DELETE /posts/{id}/tags
│   │   ├── reactions.go        ← POST /reactions, DELETE /reactions
│   │   ├── gallery.go          ← POST /gallery (album + images)
│   │   ├── calendar.go         ← GET /calendar (locale-aware), POST/PATCH/DELETE /calendar/events, PUT month note + settings
│   │   ├── pages.go            ← GET /pages/:slug (locale-aware), PUT /pages/:slug
│   │   └── admin_translations.go  ← GET list, PATCH approve, POST retranslate (admin review panel)
│   │   ├── pages.go            ← GET /pages/:slug, PUT /pages/:slug
│   │   └── assistant.go        ← POST /assistant/chat
│   ├── service/
│   │   ├── posts.go            ← CreatePost (DB + Discord + translation enqueue), List/Get with locale, Update with diff-based enqueue, SetArchived (no Discord side effect)
│   │   ├── tag.go              ← CreateTag, GetAll, Replace/RemoveTag
│   │   ├── reactions.go        ← UpsertReaction, DeleteReaction
│   │   ├── gallery.go          ← CreateAlbum, attaches images
│   │   ├── calendar.go         ← GetMonth/CreateEvent/UpdateEvent (with diff-based enqueue), UpsertMonthNote (with enqueue)
│   │   ├── pages.go            ← GetPageContent (locale-aware), UpdatePageContent (with diff-based enqueue)
│   │   └── translation.go      ← List/Approve/Retranslate/CleanupOrphans for the admin review panel; Approve also fire-and-forgets a fine-tuning pair capture
│   │   ├── pages.go            ← GetPageContent, UpdatePageContent
│   │   ├── assistant.go        ← Chat orchestration (RAG pipeline)
│   │   └── groq.go             ← Thin client for Groq LLM API
│   ├── repository/
│   │   ├── posts.go            ← InsertPost, GetPosts + GetPostByID (both take locale), UpdatePost, SetArchived, DeletePost
│   │   ├── tag.go              ← CreateTag, GetAllTags, GetTagsByPostID, ReplacePostTags, RemovePostTag, GetPostIDsWithTags
│   │   ├── reactions.go        ← UpsertReaction, GetReactionCounts, DeleteReaction
│   │   ├── gallery.go          ← InsertPostImage, GetImagesByPostID
│   │   ├── calendar.go         ← GetEventsByMonth + GetMonthNote (both locale-aware), GetEventByID (for diff), InsertEvent/UpdateEvent/DeleteEvent, UpsertMonthNote/Settings
│   │   ├── pages.go            ← GetSections (locale-aware), GetSectionsDetail (for diff), UpsertSections
│   │   ├── translation.go      ← List with multi-table record_title JOIN, GetByID, Approve, Delete, orphan sweeps (DeleteOrphanedTranslations/PendingJobs)
│   │   └── finetuning.go       ← CaptureFinetuningExample: idempotent INSERT of gold (en, vi) pairs into fine_tuning_examples
│   ├── translation/            ← Async EN→VI translation engine. See "Translation engine" section below.
│   │   ├── models.go           ← TranslationJob, Translation, ContentType
│   │   ├── prompt.go           ← PromptCache (5min TTL, falls back to stale on DB hiccup)
│   │   ├── translator.go       ← TranslateField/TranslateRecord, Gemini + Claude HTTP calls, sha256 cache lookup
│   │   ├── queue.go            ← EnqueueTranslation helper + EnqueueFn function type
│   │   └── worker.go           ← Background poller (FOR UPDATE SKIP LOCKED, 3-retry policy)
│   ├── middleware/
│   │   ├── auth.go             ← Verify Supabase JWT → check admins table → attach to ctx
│   │   ├── context.go          ← UserIDFromContext / AdminEmailFromContext / WithUserID (for tests)
│   │   ├── cors.go             ← Allow frontend origin
│   │   └── logger.go           ← Request logging
│   ├── model/
│   │   └── types.go            ← Post, Admin, Reaction, PostImage, CalendarEvent, etc. (many include MachineTranslated)
│   ├── discord/
│   │   └── webhook.go          ← SendToDiscord(channelType, message)
│   └── storage/
│       └── s3.go               ← S3Client: UploadFile, DeleteFile, PresignedURL (talks to Cloudflare R2 via custom BaseEndpoint; same code can target AWS S3 when S3_ENDPOINT is empty)
├── pkg/database/
│   └── postgres.go             ← pgx connection pool, returns *pgxpool.Pool
├── .env
├── go.mod
└── Dockerfile
```

---

## API routes

All routes are prefixed `/api/v1/`.

### Auth contract (read this before touching `cmd/server/main.go`)

Every endpoint below is split into a **public** group (no middleware) and an **admin** group (`RequireAdmin`). The split is **deliberate, not historical** - the church website's whole purpose is letting anonymous, signed-out visitors browse posts, react with emojis, view static pages, and read the calendar. **Never** move a `GET` route on `/posts`, `/posts/{id}`, `/pages/{slug}`, `/calendar`, or any `/reactions/...` path into the `RequireAdmin` group. Doing so blanks the entire site for everyone except the small admin whitelist and breaks the product. The route comments in `cmd/server/main.go` repeat this - keep them in sync if you reorganise the file.

If you find yourself wanting to add auth to a public read path, it's almost certainly the wrong fix. The only thing that should ever require a token is a *write* (POST/PATCH/PUT/DELETE) - and even then, public reactions write without one because they're rate-limited per fingerprint, not per user.

### Public (no auth - intentional, do not protect)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Liveness check |
| GET | `/api/v1/posts` | List posts. Query params: `?type=event`, `?tags=uuid1,uuid2` (filter gallery_albums by tag), `?limit=20` (cap 100), `?offset=0`, `?locale=vi` (serve translations). Each item includes presigned `images[*].storage_url`. Gallery posts include `tags` array. Non-en responses may include `machine_translated: true`. |
| GET | `/api/v1/posts/:id` | Single post with images, reaction counts, and tags (if gallery_album). `?locale=vi` for translated title/body. |
| GET | `/api/v1/tags` | List all tags ordered by name |
| GET | `/api/v1/reactions/:post_id` | Returns `ReactionSummary` - per-emoji counts + caller's reaction. Optional `?fingerprint=<fp>` query param; when omitted `my_reaction` is null. |
| POST | `/api/v1/reactions` | Add or change a reaction (upsert by fingerprint) |
| DELETE | `/api/v1/reactions/:post_id` | Remove a reaction by fingerprint |
| GET | `/api/v1/pages/:slug` | Returns `{ sections: { key: value }, machine_translated? }` for a static page. `?locale=vi` for translated sections. |
| GET | `/api/v1/calendar` | Returns events + month note + per-month settings for a given month. `?locale=vi` for translated event titles/notes and month note content. Events are selected by **range overlap** (`date < first-of-next-month AND COALESCE(end_date, date) >= first-of-month`), so a multi-day event whose span crosses a month boundary is returned for **both** months. |
| GET | `/api/v1/pages/:slug` | Returns `{ sections: { key: value } }` for a static page |
| GET | `/api/v1/calendar` | Returns events + month note + per-month settings for a given month |
| POST | `/api/v1/assistant/chat` | AI assistant chatbox with RAG context (rate-limited per IP) |
| GET | `/api/v1/admin/discord/callback` | Discord OAuth redirect target. **Public on purpose** - a browser redirect carries no Bearer token, so trust comes from the HMAC-signed `state`. Links the admin's Discord, then 303-redirects to `{FRONTEND_ORIGIN}/admin?discord=linked\|error`. Do NOT move into the admin group. See `docs/agents/discord.md`. |

> Full request/response shapes and model definitions live in `docs/api.md`.

### Admin only (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/auth/me` | Returns the authenticated admin's identity (sub + email) |
| POST | `/api/v1/posts` | Create a new post |
| PATCH | `/api/v1/posts/:id` | Edit a post |
| PATCH | `/api/v1/posts/:id/archive` | Move an event to/from the Past section. Body `{ "archived": bool }`; sets/clears `archived_at`. No Discord side effect. |
| DELETE | `/api/v1/posts/:id` | Delete a post |
| PUT | `/api/v1/pages/:slug` | Upsert sections for a static page |
| POST | `/api/v1/posts/:id/images` | Upload an image to Cloudflare R2 and attach it to a post. Returns `{ key }`. |
| POST | `/api/v1/uploads/image` | Upload an inline **body** image; returns `{ url }` (permanent public URL) to embed as `<img>`. Not tied to a post, not in `post_images`. Requires `R2_PUBLIC_URL`. |
| POST | `/api/v1/tags` | Create a new tag (label) for gallery albums |
| POST | `/api/v1/posts/:id/tags` | Replace all tags on a gallery album |
| DELETE | `/api/v1/posts/:id/tags/:tag_id` | Remove a single tag from a gallery album |
| POST | `/api/v1/calendar/events` | Create a calendar event |
| PATCH | `/api/v1/calendar/events/:id` | Edit a calendar event |
| DELETE | `/api/v1/calendar/events/:id` | Delete a calendar event |
| PUT | `/api/v1/calendar/months/:year/:month/note` | Upsert the month's sidebar note |
| PUT | `/api/v1/calendar/months/:year/:month/settings` | Upsert the month's per-month styling (accent color) |
| GET | `/api/v1/admin/translations` | List translations for the review panel. Query params: `?locale=vi`, `?approved=false\|true`, `?limit=20`, `?offset=0`. Response includes `record_title` synthesized from a JOIN to each possible parent table. |
| PATCH | `/api/v1/admin/translations/:id` | Approve a translation. Body `{translated_text?}` - omit to approve as-is, include to approve human-edited text. Sets `approved_by` to caller's JWT sub. |
| POST | `/api/v1/admin/translations/retranslate/:id` | Delete the current translation + re-enqueue. Returns 202. Used after system-prompt edits to refresh translations. |
| POST | `/api/v1/admin/translations/retranslate-all` | Bulk: delete every unapproved row and re-enqueue. Returns `{"requeued": N}`. Approved (human-reviewed) translations are skipped. Pair with `scripts/sync-prompt.sh` for prompt iterations. |
| POST | `/api/v1/admin/translations/cleanup-orphans` | Delete translations (and pending jobs) whose parent record was deleted. Returns `{"deleted_translations": N, "deleted_jobs": N}`. Only known table_names are swept; `fine_tuning_examples` is never touched. |
| GET | `/api/v1/admin/discord/link` | Returns `{ url }` - the Discord OAuth consent URL. Frontend fetches this *with* the Bearer token, then redirects the browser to `url`. `503` when the OAuth env vars are unset. See `docs/agents/discord.md`. |
| GET | `/api/v1/admin/discord/status` | `{ linked, discord_username?, discord_avatar_url? }` for the current admin - drives the composer's "posts as ..." note / link nudge. |

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
    StorageKey   string `json:"storage_key"`             // canonical S3 object key
    DisplayOrder int    `json:"display_order"`
    StorageURL   string `json:"storage_url,omitempty"`   // freshly presigned (~1h) on every list/get
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

## Translation engine (`internal/translation/`)

Async EN → VI translation for posts, page sections, calendar events, and month notes. The Go backend never blocks an HTTP write on a model call - it inserts English instantly, enqueues a job, and a background worker drains the queue.

### Flow

```
admin POST /posts  →  PostService.Create
                          ├─ posts.InsertPost (English source saved instantly)
                          ├─ go discord.SendToDiscord (existing webhook)
                          └─ enqueueTranslation(job)   ←── goroutine, fire-and-forget
                                  │
                                  ▼
                            translation_jobs row (status='pending')
                                  │
                                  ▼  every 5s
                            Worker.tick() polls FOR UPDATE SKIP LOCKED
                                  │
                                  ▼
                            Translator.TranslateRecord
                                  ├─ sha256(source) lookup in `translations` (cache)
                                  ├─ on miss: Gemini (general) or Claude (no pastoral content, just a backup for gemini)
                                  └─ upsert by (record_id, field_name, locale)

public GET /posts?locale=vi  →  PostRepository.GetPosts
                                  └─ LEFT JOIN translations + COALESCE
                                     (English fallback per-field when missing)
```

### Files

| File | Responsibility |
|---|---|
| `models.go` | `TranslationJob`, `Translation`, `ContentType` constants (`general`, `backup for Gemini, no pastoral content`) |
| `prompt.go` | `PromptCache` - in-memory cache of the system prompt body, 5-minute TTL, falls back to stale on Supabase hiccup |
| `translator.go` | `Translator` - per-field translate-and-store, sha256 cache, raw HTTP to Gemini v1beta + Claude `/v1/messages`, upsert that resets `approved_by` on source change |
| `queue.go` | `EnqueueTranslation` package-level helper + `EnqueueFn` function type that content services depend on |
| `worker.go` | `Worker` - background goroutine, polls every 5s, batches up to 5 jobs per tick, `FOR UPDATE SKIP LOCKED` for safe horizontal scaling, retries up to 3 times before marking `failed` |

### Wiring rules

- Content services depend on `translation.EnqueueFn` (a `func(TranslationJob)`), **not** on `*pgxpool.Pool`. Wiring happens in `main.go` via setters: `postSvc.SetTranslationQueue(enqueueTranslation)` etc.
- The enqueue closure in `main.go` launches its own goroutine and uses `context.Background()` (not the request context) so the calling HTTP request can return before the job-insert SQL runs.
- The closure is built whenever `dbPool != nil`. Whether the **worker** runs is gated separately on `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`: jobs always enqueue cleanly, but they only drain when at least one AI key is configured. Restarting the backend after adding a key picks up any backlog.
- Update handlers always **diff old vs new** before enqueuing. A PATCH that doesn't change a translatable field produces no translation job. See `PostService.Update`, `CalendarService.UpdateEvent`, `PageService.UpdatePageContent`.
- Locale flows through as a string query param (`?locale=vi`). The repository decides whether to add the `LEFT JOIN translations` clauses. English / missing locale uses the plain query path - **zero** translation joins on en, so unilingual visitors pay no overhead.

### Model IDs

- General content: `gemini-2.5-flash` via `https://generativelanguage.googleapis.com/v1beta` (was `gemini-2.0-flash` until Google retired it 2026-06)
- Backup for Gemini content: `claude-haiku-4-5-20251001` via `https://api.anthropic.com/v1/messages`

Both clients are raw `net/http`. SDKs were rejected to keep the Docker image and `go.mod` lean.

### Prompt versioning workflow

The system prompt is owned by the `system_prompts` table at runtime but
authored in `prompts/vi_translation_system_prompt.md` with a YAML front-matter
header (`key`, `version`). `prompts/CHANGELOG.md` records the **why** of every
version bump - patch (typo/wording), minor (vocabulary/rule additions), major
(register or audience change).

Lifecycle:

1. Edit `prompts/vi_translation_system_prompt.md` and bump `version:`.
2. Add a CHANGELOG entry that explains *why* (incident? feedback? new term?).
3. Run `scripts/sync-prompt.sh` (needs `DATABASE_URL`). The script parses the
   front-matter and upserts `(key, content, version)` via psql's `:'var'`
   substitution so apostrophes in the body are escaped safely.
4. The running backend's `PromptCache` has a 5-minute TTL - within that window
   the worker fetches the new prompt without a redeploy. `prompt.go` also
   falls back to the stale copy on a DB hiccup so a brief Supabase blip can't
   kill in-flight translations.
5. Click "Re-translate all pending" on `/admin/translations` (or POST
   `/api/v1/admin/translations/retranslate-all`). Every `approved_by IS NULL`
   row is deleted and re-queued; approved rows are deliberately skipped so a
   reviewer's edits are never auto-clobbered by a prompt change.
6. Commit `prompts/*.md` to git alongside any related code change. Git history
   = what changed; CHANGELOG = why.

The markdown-as-source / DB-as-runtime split keeps prompts diff-able and
review-able in PRs while still letting them be hot-swapped without a deploy.

### Fine-tuning data capture

Every approval on `/admin/translations` (approve-as-is or edit+approve) also
captures a gold `(source_en, approved_vi)` pair into `fine_tuning_examples` -
the dataset for a future fine-tuned open-source translation model. The hook
lives in `TranslationService.Approve` and is fire-and-forget, same pattern as
the translation enqueue: a capture failure is logged, never surfaced, and
never blocks the approval. Dedup is `ON CONFLICT (record_id, source_field,
record_table) DO NOTHING` so double-approval is a silent no-op.

Export the dataset as HuggingFace SFTTrainer JSONL with
`python scripts/export_training_pairs.py` (use `--dry-run` for a count-only
summary). Roadmap, base-model choice, and eval gates: `docs/FINE_TUNING_PLAN.md`.

---

## Environment variables

In production all env vars live in **Render's dashboard** (Settings → Environment). There is no `.env` file on the Render container disk.
For local development, create `backend/.env` (gitignored, never committed).

```
PORT=8080                                          # Render injects automatically in prod; set explicitly for local dev
DATABASE_URL=postgresql://...                      # Supabase session pooler URL with ?sslmode=require
SUPABASE_URL=https://<ref>.supabase.co             # used for JWKS endpoint (auth verification)
SUPABASE_JWT_SECRET=...                            # Supabase JWT secret (fallback for HS256; ES256 uses JWKS)
DISCORD_WEBHOOK_EVENTS=https://...
DISCORD_WEBHOOK_ANNOUNCEMENTS=https://...
DISCORD_WEBHOOK_BIBLE_STUDIES=https://...
DISCORD_WEBHOOK_PLAYLISTS=https://...
DISCORD_WEBHOOK_GALLERY=https://...
FRONTEND_ORIGIN=https://church-website-neon.vercel.app
S3_BUCKET=church-uploads-prod                      # R2 bucket name
S3_REGION=auto                                     # R2 has no regions
AWS_REGION=auto                                    # R2 has no regions
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com  # set for R2; leave empty to use AWS S3
AWS_ACCESS_KEY_ID=...                              # R2 access key (R2 has no IAM roles, static creds required)
AWS_SECRET_ACCESS_KEY=...                          # R2 secret access key

# Translation engine (Phase 2 onwards)
GEMINI_API_KEY=...                                 # General content translations. Worker stays disabled when both AI keys are empty.
ANTHROPIC_API_KEY=...                              # Backup for Gemini content + Gemini fallback (see Phase 7).
SUPPORTED_LOCALES=vi                               # Comma-separated. Defaults to "vi" when empty.
TRANSLATION_WORKER_INTERVAL=5                      # Poll interval in seconds. Defaults to 5.
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
github.com/aws/aws-sdk-go-v2    ← S3-compatible uploads (Cloudflare R2 via custom BaseEndpoint)
github.com/golang-migrate/migrate/v4 ← schema migrations applied on startup
github.com/joho/godotenv        ← load .env for local dev only
```
