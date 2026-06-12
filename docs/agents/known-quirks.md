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

## Merging master resurrects `app/layout.tsx` and breaks the i18n build
**Date solved:** 2026-06-12
**Symptom:** Vercel build fails during static generation with
`Error occurred prerendering page "/en/about"` and a bare `Error:` whose
stack points into the `use-intl` chunk at `usePathname`. Any `[locale]`
page can be the one named - it is just the first page the worker tried.
**Root cause:** The i18n setup commit deleted `frontend/app/layout.tsx`
and made `frontend/app/[locale]/layout.tsx` the de-facto root layout
(it owns `<html>`/`<body>` and wraps everything in
`NextIntlClientProvider`). `master` still has the pre-i18n
`app/layout.tsx`, so merging master into the i18n branch restores the
file. The build then nests two layouts: the resurrected root layout
mounts `Navbar`/`NavigationProgress`/`PageTransition` **above** the
`NextIntlClientProvider` that lives in the `[locale]` layout. Those
components call next-intl's `usePathname`, find no provider context,
and throw during prerender. Production builds strip the error message,
hence the empty `Error:`.
**Fix:** Delete `frontend/app/layout.tsx` after any merge from a branch
that still has it. Anything master added to that file (e.g. the ChatBox
mount) must be ported into `frontend/app/[locale]/layout.tsx` instead.
This stays a hazard until the i18n branch lands on master.
**Files affected:** `frontend/app/layout.tsx` (deleted),
`frontend/app/[locale]/layout.tsx` (received the disabled ChatBox
import + mount comments).

## Vietnamese text corrupts to `?` when piped through PowerShell 5.1
**Date solved:** 2026-06-11
**Symptom:** Seeding or updating Vietnamese test data by piping SQL (or
Python source containing Vietnamese literals) into `psql` / `python -` from
Windows PowerShell 5.1 stores literal `?` characters in place of every
accented character. Example: `Buổi thờ phượng` arrives as `Bu?i th? ph??ng`.
The data looks fine in the here-string but is already corrupted by the time
the child process reads stdin.
**Root cause:** Windows PowerShell 5.1 re-encodes text piped to native
executables using the console output encoding (a legacy codepage like cp1252
or cp437), which has no Vietnamese characters - each one degrades to `?`.
This corrupts the *input*; it is not a display issue. The production paths
are unaffected: Go + pgx and psycopg2 parameter binding are UTF-8 end to end.
**Fix:** Never pipe non-ASCII content through PowerShell stdin. Put the SQL
or Python in a file (UTF-8) and pass the *path* (`psql -f file.sql`,
`python file.py`) so the bytes never transit the console encoding. Printing
Vietnamese to the PowerShell console can also raise `UnicodeEncodeError`
under cp1252 - keep verification output ASCII (compare in-process, print
True/False) or set `$env:PYTHONIOENCODING = 'utf-8'`.
**Files affected:** none in the repo - dev-environment workflow only.

---

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
