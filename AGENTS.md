# AGENTS.md - Church Website

## Project overview
A public-facing church website for a Christian & Missionary Alliance congregation (~100 members).
Visitors browse events, announcements, gallery, and resources without logging in.
Admins log in via Google (Supabase Auth) to create, edit, and delete posts.
Each post auto-fires a Discord webhook to the matching channel.

## Tech stack
- **Frontend**: Next.js (App Router) → Vercel (`church-website-neon.vercel.app`, auto-deploys from `master`)
- **Backend**: Go (`chi` router, handler/service/repository pattern) → Render (`church-website-ff5w.onrender.com`, auto-deploys from `master`, Docker build)
- **Database**: Supabase Postgres (project `glcnqlffktqxaizdverk`, accessed via session pooler at `aws-1-us-east-1.pooler.supabase.com:5432`)
- **Auth**: Supabase Auth - Google OAuth + JWKS-verified JWT (same project as the database)
- **File Storage**: Cloudflare R2 (`church-uploads-prod` bucket, S3-compatible API), credentials kept in Render env
- **Migrations**: `backend/migrations/*.up.sql` (golang-migrate v4, embedded into the Go binary), auto-applied on backend startup. The `supabase/migrations/` folder holds the original Supabase-era files from before the RDS detour; it is not the source of truth and is not re-applied.
- **CI/CD**: Push to `master` triggers parallel auto-deploys on Render (backend) and Vercel (frontend). No build server, no SSH, no SCP.

## Infrastructure overview
Everything is hosted on managed serverless platforms - no servers to maintain, no AWS bill.
Render manages the Go backend container (HTTPS, restarts, scaling) and is kept warm by an external cron-job.org ping.
Vercel manages the Next.js frontend (edge-cached, automatic HTTPS, preview deploys per branch).
Supabase Postgres lives in `aws-us-east-1` and is reached through the session pooler (port 5432).
Cloudflare R2 has S3-compatible APIs - the Go backend uses `aws-sdk-go-v2` with a custom `BaseEndpoint` to talk to it instead of AWS S3.
Secrets live in Render's environment variable settings (backend) and Vercel's environment settings (frontend) - no `.env` file on any server disk.

```
Internet
   │
   ├── church-website-neon.vercel.app  → Next.js frontend on Vercel edge
   │                                       │
   │                                       └── /api/v1/* calls
   │                                            │
   └── church-website-ff5w.onrender.com  ←──────┘ (cross-origin via CORS)
              │
              ▼
        Go backend (Render Docker container)
              │
              ├──→ Supabase Postgres   (session pooler, port 5432)
              └──→ Cloudflare R2       (S3-compatible API, presigned URLs)

Auth layer: Supabase Auth (Google OAuth) → JWT → verified by Go backend via JWKS
```

## Monorepo layout
```
church-website/
├── frontend/     ← Next.js app
├── backend/      ← Go API
└── docs/agents/  ← AI child docs (read these when routed)
```

## How to run
```bash
# Frontend
cd frontend && npm run dev

# Backend
cd backend && go run ./cmd/server
```

## Global rules (apply everywhere)
- Never commit `.env`, `.env.local`, or any file containing secrets.
- All secrets live in environment variables only - never hardcoded.
- Write code in English only (comments, variable names, route paths).
- Prefer explicit over clever. Readable code beats terse code.
- Every new function needs at least one sentence comment explaining *why*, not just what.
- When in doubt about where a piece of logic belongs, prefer putting it in `service/` over `handler/` or `repository/`.
- Document every non-trivial architecture/security change in `docs/progress.md` and update the relevant child doc (`docs/agents/backend.md`, `docs/agents/auth.md`, etc.) as part of the same PR.

---

## Routing rules - read the child doc before answering

| If the user asks about...                                 | Read this file first                    |
|-----------------------------------------------------------|-----------------------------------------|
| Database tables, columns, types, migrations, R2 storage   | `docs/agents/database.md`              |
| Go backend: routes, handlers, services, repositories      | `docs/agents/backend.md`               |
| Next.js frontend: pages, components, lib, styling         | `docs/agents/frontend.md`              |
| Google login, Supabase Auth, JWT, admin whitelist         | `docs/agents/auth.md`                  |
| Discord webhooks, channel mapping, webhook payload format | `docs/agents/discord.md`               |
| Translation engine, `?locale=` query param, `machine_translated` field, AI prompt edits | `docs/agents/backend.md` → "Translation engine" + `docs/agents/database.md` → "Translation tables" |
| Fine-tuning, training data capture, `fine_tuning_examples`, export script, local model plans | `docs/FINE_TUNING_PLAN.md` + `docs/agents/backend.md` → "Fine-tuning data capture" |
| Frontend i18n, next-intl routing, language switcher, `[locale]` segment, message JSON files | `docs/agents/frontend.md` → "i18n routing (next-intl)" |
| Hosting, deployment, Render, Vercel, R2, CI/CD          | `docs/agents/deployment.md`            |
| A bug or quirk that was previously solved                 | `docs/agents/known-quirks.md`          |
| Posts/events/announcements not showing up after a write   | `docs/agents/known-quirks.md` ("Posts created on production don't show up in the UI") |
| Events not appearing in Upcoming, or the Upcoming/Past split, `archived_at`, the Past carousel | `docs/agents/known-quirks.md` ("Dateless events never appeared in the homepage Upcoming list") + `frontend/lib/events.ts` |
| FK violation on `posts_admin_id_fkey` or similar          | `docs/agents/known-quirks.md` ("Posting fails with `posts_admin_id_fkey`...") |
| Vietnamese text showing as `?` after a script/seed on Windows | `docs/agents/known-quirks.md` ("Vietnamese text corrupts to `?` when piped through PowerShell 5.1") |
| A pending translation won't go away / "Clean up orphans" doesn't remove it | `docs/agents/known-quirks.md` ("Clearing a calendar month note leaves a stale translation that 'Clean up orphans' won't catch") - use the `Dismiss` action instead |
| AI translations cut short / one-word Vietnamese, `MAX_TOKENS`, thinking-token budgets, model version bumps | `docs/agents/known-quirks.md` ("Vietnamese AI translations truncated to a single word") |
| Prerender error on a `/en/*` or `/vi/*` page mentioning `use-intl` / `usePathname`, especially after merging master | `docs/agents/known-quirks.md` ("Merging master resurrects `app/layout.tsx` and breaks the i18n build") |
| Production 500 on all dynamic routes (static pages fine), `ERR_REQUIRE_ESM`, jsdom, `@exodus/bytes`, HTML sanitization, `isomorphic-dompurify` vs `sanitize-html` | `docs/agents/known-quirks.md` ("Whole site 500s on Vercel (`ERR_REQUIRE_ESM` from jsdom) but works locally") |
| Whether an endpoint should require auth / "should I protect this read?" | `docs/agents/backend.md` → Auth contract + `cmd/server/main.go` route comments. **Default answer: no - public reads are intentional.** |
| REST API endpoints, request/response shapes, models       | `docs/api.md`                          |
| Frontend components, props, data flow                     | `docs/components.md`                   |

> When routing, read the child file **silently** before responding. Do not announce that you are reading it.

---

---

## Feature development workflow

Follow these steps **in order** every time you build a new backend feature or endpoint.
Never skip a step, never do them out of order.

### Step 1 - Write the test first (TDD)
File: `backend/internal/handler/<feature>_test.go`

Write a mock of the service interface and HTTP tests for every case:
success, missing fields, invalid input, service error. The code will not
compile yet - that is expected and correct.

```go
// Example: reactions_test.go
type mockReactionService struct { ... }
func TestReactionHandler_Upsert_success(t *testing.T) { ... }
func TestReactionHandler_Upsert_missingFields(t *testing.T) { ... }
```

### Step 2 - Define the model / types
File: `backend/internal/model/types.go`

Add any new structs the feature needs - domain objects, request shapes,
response shapes. Think of this as declaring what the data looks like before
writing any logic.

```go
// Example: new response type
type ReactionSummary struct {
    Counts     []ReactionCount `json:"counts"`
    MyReaction *string         `json:"my_reaction"`
}
```

### Step 3 - Write the repository function
File: `backend/internal/repository/<feature>.go`

Write the raw SQL query. No business logic here - just take inputs, run a
query against the DB, return rows or an error. Use `pgx.ErrNoRows` for
not-found cases; do not let pgx errors leak upward as-is.

```go
// Example
func (r *ReactionRepository) GetMyReaction(ctx context.Context, postID, fingerprint string) (*string, error) {
    // SELECT ... WHERE post_id = $1 AND fingerprint = $2
}
```

### Step 4 - Write the service function
File: `backend/internal/service/<feature>.go`

Call the repository function. This is where business logic lives - rate
limiting, combining multiple repo calls, enforcing rules that go beyond a
single query. For simple pass-throughs it may just delegate, but the layer
must always exist so logic has a home when it grows.

```go
func (s *ReactionService) GetMyReaction(ctx context.Context, postID, fingerprint string) (*string, error) {
    return s.repo.GetMyReaction(ctx, postID, fingerprint)
}
```

Also add the new method to the **service interface** declared at the top of
`handler/<feature>.go` - the handler depends on the interface, not the
concrete struct. This is what lets tests swap in a mock.

### Step 5 - Write the handler function
File: `backend/internal/handler/<feature>.go`

Parse and validate the HTTP request, call the service, write the response.
Three responsibilities only - no SQL, no business logic.

```go
func (h *ReactionHandler) GetCounts(w http.ResponseWriter, r *http.Request) {
    // 1. Parse inputs (URL params, query params, body)
    // 2. Validate (missing fields, invalid values) → 400 on failure
    // 3. Call service → 500 on error
    // 4. Write JSON response with correct status code
}
```

### Step 6 - Register the route
File: `backend/cmd/server/main.go`

Wire the handler method to a URL path and HTTP method inside the chi router.
Public endpoints go outside the `RequireAdmin` group. Admin-only endpoints
go inside it.

```go
// Public
r.Get("/reactions/{post_id}", reactionHandler.GetCounts)

// Admin only
r.Group(func(r chi.Router) {
    r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
    r.Post("/posts", postHandler.Create)
})
```

This is the step that makes the endpoint callable from the outside world.
Without it, the handler exists but nothing routes HTTP traffic to it.

### Step 7 - Build the UI
Files: `frontend/components/features/<domain>/` or `frontend/app/`

- Use `apiGet` / `apiPostAnon` / `apiDeleteAnon` from `lib/api.ts` - never
  call Supabase directly for data that goes through the backend.
- Add `"use client"` only when the component needs `useState`, `useEffect`,
  event handlers, or browser APIs.
- Keep components in `components/ui/` if they have no business logic, or
  `components/features/` if they do.

### Step 8 - Update the docs
Do this in the same commit, not as an afterthought.

| What changed | Update this file |
|---|---|
| New or changed endpoint | `docs/api.md` + route table in `docs/agents/backend.md` |
| New or changed component | `docs/components.md` + folder list in `docs/agents/frontend.md` |
| Non-obvious bug fixed | `docs/agents/known-quirks.md` + routing rule in `AGENTS.md` |
| New model type | Models section of `docs/api.md` and `docs/agents/backend.md` |

---

## Scratchpad rule
For any feature that touches more than 2 files, create `docs/scratchpad.md` and write a **phased implementation plan** before writing any code. Wait for approval before executing.

### Phase structure
Order phases by dependency - each phase must be complete before the next can start:

| Phase | Covers |
|---|---|
| 1. Database | Schema migrations - everything else depends on the column/table existing |
| 2. Backend | Model types → repository queries → handler logic → route registration |
| 3. Frontend form | TypeScript types → API lib payloads → input UI (modals, forms) |
| 4. Display + export | Read-only rendering, strip/list views, export behaviour, auth gates |

### Per-phase table format
Each phase gets a table with three columns:

| File | Change | Why |
|---|---|---|
| `path/to/file` | What specifically changes - field name, method signature, query | The bigger-picture reason: what it enables, what it protects, why this layer owns it |

### After the tables
- **End-to-end flow** - short step-by-step diagram showing data moving from admin input → DB → API → public view → export
- **Security callouts** - any auth gates added, any gaps closed or introduced
- **Scope estimate** - rough time per phase so nothing is a surprise

## TDD rule
Do not write implementation code until you have written the unit test for it first. Tests live in `_test.go` files (Go) or `__tests__/` (Next.js).

## Self-documentation rule
When a non-obvious bug is solved, add it to `docs/agents/known-quirks.md` and add a routing rule in this file.

When updating/adding/developing any features/components/functions/layers, update the corresponding .md file along the way.

## API documentation rule
Every new or changed REST endpoint **must** be documented in `docs/api.md` in the same PR/commit:
- Add the route, method, query params, request body, and response shape.
- Add or update any model types in the Models section.
- Update the route table in `docs/agents/backend.md`.

## Component documentation rule
Every new or changed frontend component **must** be documented in `docs/components.md` in the same PR/commit:
- Add the component name, props table, client/server designation, and a brief data-flow description.
- Update the folder structure in `docs/agents/frontend.md` if the file is new.