## Scratchpad (deprecated)

We are consolidating design/progress tracking into `docs/progress.md`.

`docs/progress.md` now contains feature-level design decisions, architecture notes, metrics, and implementation diary entries.

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

1. Run `go mod tidy` in `backend/` to resolve and lock dependencies.
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
