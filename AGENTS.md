# AGENTS.md — Church Website

## Project overview
A public-facing church website for a Christian & Missionary Alliance congregation (~100 members).
Visitors browse events, announcements, gallery, and resources without logging in.
Admins log in via Google (Supabase Auth) to create, edit, and delete posts.
Each post auto-fires a Discord webhook to the matching channel.

## Tech stack
- **Frontend**: Next.js (App Router) → EC2 + Nginx + systemd (served at `vgomne.ddns.net`)
- **Backend**: Go (`chi` router, handler/service/repository pattern) → EC2 + systemd
- **Database**: AWS RDS PostgreSQL (`church-db`, db.t4g.micro, us-east-1)
- **Auth**: Supabase Auth — Google OAuth + JWKS-verified JWT (**still in use**, not migrated)
- **File Storage**: AWS S3 (`church-uploads-prod-058264284549-us-east-1-an`, us-east-1)
- **Reverse proxy**: Nginx on EC2 — routes `/api/*` → Go on port 8080, everything else → Next.js on port 3000
- **CI/CD**: GitHub Actions — cross-compiles Go binary for Linux, builds Next.js, SCPs artifacts to EC2, SSHs in and restarts systemd services

## Infrastructure overview
All services run on a single EC2 instance (us-east-1, Northern Virginia) with a static Elastic IP.
Nginx sits in front of both apps and handles SSL termination (Let's Encrypt via Certbot).
Both Go and Next.js are registered as systemd services — they auto-start on boot and self-restart on crash.
RDS and EC2 talk privately over port 5432 via auto-created security groups (`rds-ec2-1` on RDS, `ec2-rds-1` on EC2).
S3 bucket is fully private (no public access); access is controlled by IAM policies.
All secrets live in systemd service environment files — no `.env` file on disk.

```
Internet → Nginx (EC2, port 443/80)
              ├── /api/*  → Go backend  (port 8080, systemd: church-backend)
              └── /*      → Next.js     (port 3000, systemd: church-frontend)
                                │
                    ┌───────────┴────────────┐
                    AWS RDS PostgreSQL      AWS S3
                    (private, port 5432)    (private, IAM-controlled)

Auth layer: Supabase Auth (Google OAuth) → JWT → verified locally via JWKS
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
- All secrets live in environment variables only — never hardcoded.
- Write code in English only (comments, variable names, route paths).
- Prefer explicit over clever. Readable code beats terse code.
- Every new function needs at least one sentence comment explaining *why*, not just what.
- When in doubt about where a piece of logic belongs, prefer putting it in `service/` over `handler/` or `repository/`.
- Document every non-trivial architecture/security change in `docs/progress.md` and update the relevant child doc (`docs/agents/backend.md`, `docs/agents/auth.md`, etc.) as part of the same PR.

---

## Routing rules — read the child doc before answering

| If the user asks about...                                 | Read this file first                    |
|-----------------------------------------------------------|-----------------------------------------|
| Database tables, columns, types, migrations, S3 storage   | `docs/agents/database.md`              |
| Go backend: routes, handlers, services, repositories      | `docs/agents/backend.md`               |
| Next.js frontend: pages, components, lib, styling         | `docs/agents/frontend.md`              |
| Google login, Supabase Auth, JWT, admin whitelist         | `docs/agents/auth.md`                  |
| Discord webhooks, channel mapping, webhook payload format | `docs/agents/discord.md`               |
| Hosting, deployment, EC2, Nginx, systemd, CI/CD          | `docs/agents/deployment.md`            |
| A bug or quirk that was previously solved                 | `docs/agents/known-quirks.md`          |
| REST API endpoints, request/response shapes, models       | `docs/api.md`                          |
| Frontend components, props, data flow                     | `docs/components.md`                   |

> When routing, read the child file **silently** before responding. Do not announce that you are reading it.

---

---

## Feature development workflow

Follow these steps **in order** every time you build a new backend feature or endpoint.
Never skip a step, never do them out of order.

### Step 1 — Write the test first (TDD)
File: `backend/internal/handler/<feature>_test.go`

Write a mock of the service interface and HTTP tests for every case:
success, missing fields, invalid input, service error. The code will not
compile yet — that is expected and correct.

```go
// Example: reactions_test.go
type mockReactionService struct { ... }
func TestReactionHandler_Upsert_success(t *testing.T) { ... }
func TestReactionHandler_Upsert_missingFields(t *testing.T) { ... }
```

### Step 2 — Define the model / types
File: `backend/internal/model/types.go`

Add any new structs the feature needs — domain objects, request shapes,
response shapes. Think of this as declaring what the data looks like before
writing any logic.

```go
// Example: new response type
type ReactionSummary struct {
    Counts     []ReactionCount `json:"counts"`
    MyReaction *string         `json:"my_reaction"`
}
```

### Step 3 — Write the repository function
File: `backend/internal/repository/<feature>.go`

Write the raw SQL query. No business logic here — just take inputs, run a
query against the DB, return rows or an error. Use `pgx.ErrNoRows` for
not-found cases; do not let pgx errors leak upward as-is.

```go
// Example
func (r *ReactionRepository) GetMyReaction(ctx context.Context, postID, fingerprint string) (*string, error) {
    // SELECT ... WHERE post_id = $1 AND fingerprint = $2
}
```

### Step 4 — Write the service function
File: `backend/internal/service/<feature>.go`

Call the repository function. This is where business logic lives — rate
limiting, combining multiple repo calls, enforcing rules that go beyond a
single query. For simple pass-throughs it may just delegate, but the layer
must always exist so logic has a home when it grows.

```go
func (s *ReactionService) GetMyReaction(ctx context.Context, postID, fingerprint string) (*string, error) {
    return s.repo.GetMyReaction(ctx, postID, fingerprint)
}
```

Also add the new method to the **service interface** declared at the top of
`handler/<feature>.go` — the handler depends on the interface, not the
concrete struct. This is what lets tests swap in a mock.

### Step 5 — Write the handler function
File: `backend/internal/handler/<feature>.go`

Parse and validate the HTTP request, call the service, write the response.
Three responsibilities only — no SQL, no business logic.

```go
func (h *ReactionHandler) GetCounts(w http.ResponseWriter, r *http.Request) {
    // 1. Parse inputs (URL params, query params, body)
    // 2. Validate (missing fields, invalid values) → 400 on failure
    // 3. Call service → 500 on error
    // 4. Write JSON response with correct status code
}
```

### Step 6 — Register the route
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

### Step 7 — Build the UI
Files: `frontend/components/features/<domain>/` or `frontend/app/`

- Use `apiGet` / `apiPostAnon` / `apiDeleteAnon` from `lib/api.ts` — never
  call Supabase directly for data that goes through the backend.
- Add `"use client"` only when the component needs `useState`, `useEffect`,
  event handlers, or browser APIs.
- Keep components in `components/ui/` if they have no business logic, or
  `components/features/` if they do.

### Step 8 — Update the docs
Do this in the same commit, not as an afterthought.

| What changed | Update this file |
|---|---|
| New or changed endpoint | `docs/api.md` + route table in `docs/agents/backend.md` |
| New or changed component | `docs/components.md` + folder list in `docs/agents/frontend.md` |
| Non-obvious bug fixed | `docs/agents/known-quirks.md` + routing rule in `AGENTS.md` |
| New model type | Models section of `docs/api.md` and `docs/agents/backend.md` |

---

## Scratchpad rule
For any feature that touches more than 2 files, create `docs/scratchpad.md` and plan the full implementation (files to change, order of changes, potential side effects) **before writing any code**.

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