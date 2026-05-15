# docs/agents/known-quirks.md - Known Bugs & Solved Problems

This file is auto-maintained. When a non-obvious bug is solved, document it here and add a routing rule in `AGENTS.md`.

---

<!-- Add entries here as bugs are discovered and solved. Format:

## [Short title of the bug]
**Date solved:** YYYY-MM-DD
**Symptom:** What went wrong / what error appeared
**Root cause:** Why it happened
**Fix:** Exactly what was changed
**Files affected:** list them

-->

## Public read endpoints intentionally have no auth - do not "fix" them
**Date noted:** 2026-04-27
**Symptom:** An agent reviewing `cmd/server/main.go` notices that
`GET /api/v1/posts`, `GET /api/v1/posts/{id}`, `GET /api/v1/pages/{slug}`,
`GET /api/v1/calendar`, and the entire `/reactions/...` family sit outside
the `RequireAdmin` group, decides this looks "unprotected," and moves them
into the admin group as a perceived security improvement. The site goes
blank for every non-admin visitor on the next deploy.
**Root cause:** This is a public church website. Anonymous visitors -
people who don't and shouldn't have accounts - are the **primary** audience
for posts, pages, the calendar, and reactions. Wrapping those reads in
`RequireAdmin` is not a hardening; it deletes the product. Reactions write
without a token on purpose: anti-spam is enforced by the per-fingerprint
unique constraint and the curated emoji whitelist, not by login.
**Fix / prevention:**
- Comments above each route group in `backend/cmd/server/main.go` now
  spell out which endpoints are public-by-design and forbid moving them.
- `docs/agents/backend.md` has an "Auth contract" callout above the route
  tables saying the same.
- `docs/api.md` opens with the same callout.
- `AGENTS.md` has a routing rule sending anyone asking "should this
  require auth?" to those docs first; default answer is **no**.
**Files affected:** `backend/cmd/server/main.go`,
`docs/agents/backend.md`, `docs/api.md`, `AGENTS.md`,
`docs/agents/known-quirks.md`.

---

## Posts created on production don't show up in the UI
**Date solved:** 2026-04-27
**Symptom:** Admin creates a post via the form (HTTP 201, Discord webhook
fires), but `/announcements`, `/events`, `/admin`, and the homepage all
behave as if it never existed.
**Root cause:** Split-brain database. At the time, the Go backend wrote
posts to AWS RDS (the source of truth then), but the Next.js public/admin
pages were still calling `supabase.from('posts')...` against the legacy
Supabase Postgres. Two physically separate databases - writes landed in
RDS, reads came from Supabase, so new posts were invisible. This was
migration debt: page content (`/about`, `/connect`) had been moved to
the Go API, but the post feeds were never migrated.
**Fix:** Migrated all post reads to the Go backend.
- New `apiGetCached(path, revalidate)` helper in `frontend/lib/api.ts` for
  server-rendered routes that want Next.js to cache for N seconds.
- `frontend/app/{page,announcements/page,events/page,admin/page}.tsx` now
  call `apiGet(Cached)('/api/v1/posts?type=...')` instead of Supabase.
- Backend `service/posts.go` was extended to enrich each post with its
  images, generating a fresh ≈1h presigned `storage_url` per image on
  every list/get. `repository/gallery.go` got `GetImagesByPostIDs` for a
  single batched lookup. `handler/posts.go` now honors `limit`/`offset`
  with a hard cap of 100.
- `model.PostImage` gained a `storage_url` JSON field.
- `frontend/lib/types.ts` `Post.post_images` was renamed to `images` to
  match the backend JSON tag, and `PostCard.tsx` was updated.
- Stale comment in `scripts/rds-schema.sql` ("posts are read from Supabase
  by the frontend directly") was removed - it documented the pre-migration
  state and was actively misleading.
**Detection rule going forward:** No code under `frontend/` may call
`supabase.from(...)` for application data. Supabase is auth-only from the
frontend's perspective; even now that the database is back on the same
Supabase project, all reads and writes flow through the Go backend so
caching, presigning, and rate-limiting stay in one place. Grep for
`supabase.from(` under `frontend/` in CI if you want to make this
enforceable.
**Historical note:** The RDS vs Supabase Postgres split that originally
caused this bug no longer exists - the database moved back to Supabase on
2026-05-15 (see `docs/progress.md`). The frontend rule above still
stands; routing all data through the Go backend is what guarantees a
single consistent reader/writer.
**Files affected:** `backend/internal/{model/types.go,
service/posts.go, repository/gallery.go, handler/posts.go}`,
`backend/cmd/server/main.go`, `frontend/lib/{api.ts,types.ts}`,
`frontend/app/{page,announcements/page,events/page,admin/page}.tsx`,
`frontend/components/features/posts/PostCard.tsx`,
`backend/migrations/000001_initial_schema.up.sql` (the canonical schema),
`docs/api.md`, `docs/agents/frontend.md`.

---

## Posting fails with `posts_admin_id_fkey` foreign key violation
**Date solved:** 2026-04-27
**Symptom:** Creating a post on production returns
`{"error":"insert: ERROR: insert or update on table \"posts\" violates foreign key constraint \"posts_admin_id_fkey\" (SQLSTATE 23503)"}`.
**Root cause:** Production had a stray FK `posts.admin_id → admins(id)`,
but by design `admin_id` stores the **Supabase JWT `sub` claim** (the auth
user UUID), not the local `admins.id`. The two UUID spaces are unrelated, so
the FK could never be satisfied. The canonical schema in
`backend/migrations/000001_initial_schema.up.sql` declares `admin_id` as
plain `uuid` with no FK on `posts`, `calendar_events`,
`calendar_month_notes`, or `calendar_month_settings` - production had
drifted from it (likely a hand-applied constraint at some point). The
same drift may exist on the calendar tables since they store `admin_id`
the same way.
**Extra hazard now that the DB is back on Supabase:** `auth.users` lives
in the same database again, so a misguided "let's add the missing FK to
auth.users" change would now succeed at create-time and break writes the
same way the original `posts_admin_id_fkey` did. The decoupling is
deliberate; do not add the FK without an explicit decision and a
migration in `backend/migrations/` that updates this entry first.
**Fix:** Drop the stray constraint on production:
```sql
ALTER TABLE posts DROP CONSTRAINT posts_admin_id_fkey;
-- And check the calendar tables for the same drift:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('calendar_events'::regclass, 'calendar_month_notes'::regclass)
  AND contype = 'f';
-- Drop any *_admin_id_fkey found there too.
```
Code was already correct - `service/posts.go` sets `AdminID = &userID` where
`userID` is the JWT `sub` (see `middleware/auth.go`), matching the
canonical schema.
**Files affected:** none (production schema only). Reference:
`backend/internal/service/posts.go`, `backend/internal/middleware/auth.go`,
`backend/migrations/000001_initial_schema.up.sql`.
