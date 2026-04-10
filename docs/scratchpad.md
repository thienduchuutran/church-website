## Scratchpad (deprecated for new features — use progress.md)

We are consolidating design/progress tracking into `docs/progress.md`.

`docs/progress.md` now contains feature-level design decisions, architecture notes, metrics, and implementation diary entries.

---

## DB-backed page content (About & Connect) — Phase 2

**Goal:** Replace hardcoded `content` constants in `/about` and `/connect` pages with
DB-backed content that admins can edit via `/admin/pages/:slug`.

### Database table: `page_content`
```sql
create table page_content (
  id          uuid primary key default gen_random_uuid(),
  page_slug   text not null,
  section_key text not null,
  content     text not null default '',
  updated_at  timestamptz default now(),
  unique (page_slug, section_key)
);
```
RLS: public SELECT, no public INSERT/UPDATE/DELETE.

### API endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/pages/:slug` | public | Returns `{ sections: { "key": "value", ... } }` |
| PUT | `/api/v1/pages/:slug` | admin | Upserts sections: `{ sections: { "key": "value", ... } }` |

### Backend files (AGENTS.md order)
1. `backend/internal/handler/pages_test.go` — mock service, test Get + Update
2. `backend/internal/model/types.go` — add PageContent struct + request type
3. `backend/internal/repository/pages.go` — GetSections, UpsertSections
4. `backend/internal/service/pages.go` — GetPageContent, UpdatePageContent
5. `backend/internal/handler/pages.go` — service interface, Get, Update handlers
6. `backend/cmd/server/main.go` — register routes

### Frontend files
7. `frontend/app/about/page.tsx` — fetch from API, fall back to defaults
8. `frontend/app/connect/page.tsx` — fetch from API, fall back to defaults
9. `frontend/app/admin/pages/[slug]/page.tsx` — admin editor form
10. `frontend/app/admin/page.tsx` — add "Edit Pages" links

### Section keys per page

**about:** hero_title, hero_subtitle, mission_heading, mission_body,
beliefs_heading, beliefs_body, story_heading, story_body,
values_heading, values_item_1, values_item_2, values_item_3, values_item_4

**connect:** hero_title, hero_subtitle,
service_times_heading, service_time_1_day, service_time_1_time, service_time_1_label,
service_time_2_day, service_time_2_time, service_time_2_label,
location_heading, location_address, location_city_state_zip, location_directions_note,
contact_heading, contact_email, contact_phone, contact_note,
plan_a_visit_heading, plan_a_visit_body

### Potential side effects
- Frontend pages become async server components fetching from backend
- If backend is down, pages use hardcoded defaults as fallback
- No Discord webhook needed for page content updates

---

## Facebook-style emoji reaction picker (hover popup)

**Goal:** Replace the flat emoji row in `ReactionBar.tsx` with a Facebook-style UX: a single "Like" button that reveals a smooth hover popup with 👍 ❤️ 🙏 😂 options. Clicking a reaction saves it anonymously via fingerprint.

### Files to change (in order)

1. `backend/internal/handler/reactions_test.go` ← TDD: write tests first
2. `backend/internal/service/reactions.go` ← wire ReactionRepository into service
3. `backend/internal/handler/reactions.go` ← HTTP handlers (Upsert, Delete, GetCounts)
4. `backend/cmd/server/main.go` ← add reaction routes to chi router
5. `frontend/lib/api.ts` ← add `apiPostAnon` / `apiDeleteAnon` (no auth token)
6. `frontend/components/features/posts/ReactionBar.tsx` ← full redesign

### Design decisions

- **Fingerprint**: random UUID stored in `localStorage` under key `church_reaction_fp`. Generated once per browser, persisted forever. No login required.
- **Hover trigger**: `onMouseEnter`/`onMouseLeave` on a container `div` wrapping both the picker and the Like button — so moving the mouse from button to picker does not close it.
- **Picker animation**: Tailwind `transition-all duration-200` + `translate-y-2 opacity-0` → `translate-y-0 opacity-100`. Uses `pointer-events-none` when hidden.
- **Toggle off**: Clicking your own active reaction removes it (DELETE). Clicking a different emoji changes it (POST upsert).
- **Optimistic update**: Update `counts` and `myReaction` immediately; no loading state beyond a `pending` lock to prevent double-submit.
- **Reads**: Still go directly to Supabase anon client (no need to go through Go for reads).
- **Writes**: Go through Go backend (`POST /api/v1/reactions`, `DELETE /api/v1/reactions/:post_id`).

### Potential side effects

- `ReactionBar` no longer shows all four emojis by default — it shows a Like button + counts for emojis that have reactions. This is a UX change visible site-wide on PostCard.
- The `apiPostAnon` / `apiDeleteAnon` helpers bypass the auth header — only valid for public endpoints.
- Backend reaction routes must be registered **before** the admin-only group in `main.go` so they don't inherit the `RequireAdmin` middleware.

---

## Backend setup scratchpad

Goal: make `backend/` fully bootstrapped so it compiles, runs, and has dependency management in place.

### Files to add/update

1. `backend/internal/handler/health_test.go`
   - Add tests first (TDD) for health endpoint response contract.
2. `backend/internal/handler/health.go`
   - Implement health handler used by the API router.
3. `backend/internal/middleware/cors.go`
   - Add explicit CORS middleware with env-configured frontend origin.
4. `backend/internal/middleware/cors_test.go`
   - Add unit test for CORS headers.
5. `backend/cmd/server/main.go`
   - Wire env loading, optional DB pool init, chi router, middleware, and routes.

### Command steps

1. Run `go mod tidy` in `backend/` to verify setup.
2. Run `go test ./...` to verify setup.

### Side effects / risks

- Server startup now validates environment at runtime and may skip DB wiring when `DATABASE_URL` is missing in local dev.
- CORS behavior is strict to configured origin unless wildcard is set.

---

## Environment bootstrap scratchpad

Goal: provide ready-to-edit local env files for frontend, backend, and database connection placeholders.

### Files to add/update

1. `.gitignore`
   - Add environment ignore patterns to prevent local secrets from being committed.
2. `backend/.env`
   - Add placeholder backend runtime variables, including database URL and Discord webhooks.
3. `frontend/.env.local`
   - Add placeholder frontend public runtime variables.

### Order of changes

1. Update ignore rules first.
2. Add backend env template values with empty placeholders.
3. Add frontend env template values with empty placeholders.

### Side effects / risks

- New local env files are intentionally not committed after ignore rules are in place.
- Backend may still run in degraded mode if required values are left empty.

---

## Frontend cornerstone scratchpad

Goal: shared site shell with viewer-default PostCard/PostFeed, then admin chrome, then write path.

### Milestone 1 — shell-postcard (public reads)

Files to create/modify:
1. `frontend/lib/types.ts` — TS types matching database schema
2. `frontend/lib/supabase.ts` — Supabase anon client for public reads
3. `frontend/lib/api.ts` — Fetch wrapper for Go backend writes (stubbed, fleshed out in milestone 3)
4. `frontend/app/globals.css` — Church design tokens (Tailwind v4 CSS-first)
5. `frontend/next.config.ts` — Image remote patterns for Supabase Storage
6. `frontend/components/ui/Navbar.tsx` — Responsive nav with mobile menu
7. `frontend/components/features/posts/PostCard.tsx` — Facebook-style post card (server component)
8. `frontend/components/features/posts/PostFeed.tsx` — List of PostCards + empty state
9. `frontend/components/features/posts/ReactionBar.tsx` — Emoji display (client component)
10. `frontend/app/layout.tsx` — Root layout with Navbar + footer
11. `frontend/app/page.tsx` — Homepage: hero + latest announcements + upcoming events
12. `frontend/app/announcements/page.tsx` — Full announcement feed
13. `frontend/app/events/page.tsx` — Full events feed

### Milestone 2 — admin-layer (auth + admin chrome)

1. `frontend/lib/auth.ts` — Auth context/provider, session helpers, admin check
2. `frontend/components/features/admin/AdminControls.tsx` — Edit/delete overlays on PostCard
3. `frontend/app/admin/page.tsx` — Admin dashboard (login prompt + all posts)
4. Update Navbar with login/logout button
5. Update PostCard/PostFeed to accept `isAdmin` and show controls

### Milestone 3 — writes-api (create/edit/delete wiring)

1. Flesh out `frontend/lib/api.ts` with POST/PATCH/DELETE
2. `frontend/components/features/admin/AdminPostForm.tsx` — Create/edit form
3. `frontend/app/admin/[section]/page.tsx` — Section-specific create/edit page
4. Backend: implement PostService, PostHandler CRUD methods
5. Backend: wire routes + services + repos in main.go
6. Backend: unit tests for handler and service layers
