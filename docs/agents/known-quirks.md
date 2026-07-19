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

## Vietnamese AI translations truncated to a single word ("VBS T-Shirt!" -> "Áo")
**Date solved:** 2026-07-19 (root cause; cache purge + stop-reason detector follow in separate commits)
**Symptom:** Post titles translated to Vietnamese came back as one word and were
served that way on the site: "VBS T-Shirt!" -> "Áo", "VANE Leadership Conference
in New Jersey!" -> "Hội". No errors anywhere - the backend logged normal
`translation_api` lines and the rows landed in `translations` looking successful.
**Root cause:** Two changes interacting. (1) `TranslateField` computed the output
budget as `len(trimmed) * 2` with a floor of 64 - a byte count pretending to be a
token count, tuned for `gemini-2.0-flash`. (2) The 2026-06-24 bump to
`gemini-2.5-flash` (after Google retired 2.0) was treated as drop-in, but 2.5 is
a thinking model with thinking ON by default, and its thinking tokens count
against `maxOutputTokens`. Reproduced live: with a 64-token cap the model spent
59 tokens thinking, emitted 1 answer token ("Á"), and stopped with
`finishReason: MAX_TOKENS`. Truncation is delivered inside an HTTP 200, and
`callGemini` never read `finishReason`, so the stump was persisted (and cached
by source hash) as a valid translation. Thinking usage is also unpredictable
(777 tokens observed for a 12-char title), so no input-scaled formula can work.
**Fix:** Replaced the scaled formula with a fixed generous `maxOutputTokens =
16384` constant passed to both providers (thinking left on for quality).
Follow-ups: purge poisoned `is_ai_generated AND approved_by IS NULL` cache rows
so they re-translate, and fail loudly on `MAX_TOKENS`/`stop_reason` before
persisting so the next silent truncation surfaces on day one.
**Files affected:** `backend/internal/translation/translator.go`

## Whole site 500s on Vercel (`ERR_REQUIRE_ESM` from jsdom) but works locally
**Date solved:** 2026-06-26
**Symptom:** Every dynamically server-rendered route on production (`/`, `/vi`,
`/vi/events`, `/vi/about`, `/announcements`, ...) returned HTTP 500, while
statically pre-rendered routes (`/vi/gallery`, `/vi/resources`, `/vi/calendar`)
were fine. The build succeeded and the exact same bundle served 200 on every
route locally (`next start` and even an `output: 'standalone'` build). Vercel
runtime logs showed: `Failed to load external module jsdom-...:
ERR_REQUIRE_ESM: require() of ES Module .../@exodus/bytes/encoding-lite.js from
.../html-encoding-sniffer/lib/html-encoding-sniffer.js not supported`, thrown at
module evaluation of an SSR chunk.
**Root cause:** `lib/sanitizeBody.ts` and `components/editor/RichContent.tsx`
imported `isomorphic-dompurify`. On the server that drags in `jsdom`, whose
transitive dep `@exodus/bytes/encoding-lite.js` is an ES Module. Turbopack keeps
`jsdom` external, so at runtime it is loaded with Node's `require()` - and
`require()` of an ESM only works on Node >= 22.12. Local Node was 22.22.3 (works);
Vercel's function ran an older Node, so it threw. Importing that module graph
crashes the SSR chunk at module-eval, which is why every dynamic page died while
static pages (which never import it) survived. The pages' own data fetches were
all guarded, so this looked nothing like a data/backend error.
**Fix:** Removed `jsdom` from the server entirely. Replaced `isomorphic-dompurify`
with `sanitize-html` (a parser-based sanitizer, no DOM, no jsdom) in
`lib/sanitizeBody.ts`, preserving the exact allowed-tags/attrs list and the
text-align-only inline-style rule. Added `htmlToText()` there for the word count
and rewired `RichContent.tsx` to it (it had a second direct DOMPurify import).
Dropped `isomorphic-dompurify` + `@types/dompurify`, added `sanitize-html` +
`@types/sanitize-html`. (Also pinned `engines.node >= 22.12.0` as a guardrail,
but the dependency removal is the real fix - it no longer depends on the runtime
Node version.)
**Files affected:** `frontend/lib/sanitizeBody.ts`,
`frontend/components/editor/RichContent.tsx`, `frontend/package.json`,
`frontend/.nvmrc` (new).

## Dateless events never appeared in the homepage Upcoming list
**Date solved:** 2026-06-25
**Symptom:** An event-type post created without a date/time never showed up in
the homepage "Upcoming Events" section. It existed and was reachable on `/events`,
but the homepage silently dropped it.
**Root cause:** The homepage built its list with
`allEvents.filter((p) => p.event_date && p.event_date >= nowIso)`. The leading
`p.event_date &&` truthiness check discarded every event whose `event_date` was
null *before* the date comparison ran - so a dateless event could never qualify as
"upcoming". Fine for a purely date-sorted teaser, wrong once dateless events were allowed.
**Fix:** Added a manual `archived_at` flag (migration `000007`) and a shared, pure
classifier `frontend/lib/events.ts` → `partitionEvents`. An event is Upcoming when it
is not archived AND (has no date OR its date is still ahead); Past when archived OR its
date has passed. The homepage and `/events` now render an Upcoming feed plus a swipeable
Past carousel, and admins move events between the two with `EventArchiveButton`
(`PATCH /posts/:id/archive`).
**Files affected:** `backend/migrations/000007_post_archived_at.{up,down}.sql`,
`backend/internal/{model/types,repository/posts,service/posts,handler/posts}.go`,
`backend/cmd/server/main.go`, `frontend/lib/{events,posts,types}.ts`,
`frontend/components/features/posts/{PostCard,PastEventsCarousel}.tsx`,
`frontend/components/features/admin/EventArchiveButton.tsx`,
`frontend/app/[locale]/page.tsx`, `frontend/app/[locale]/events/page.tsx`.

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
