# progress.md - System Growth & Resume Notes

## Project Context
church-website: a Next.js frontend on Vercel + Go backend on Render + Supabase (Postgres + Auth) + Cloudflare R2 (file storage). Fully serverless, $0/month operating cost.

## 2026-08-01 - Removed: creating an event no longer writes a line into the month note

Creating a calendar event appended `• May 22: Youth Camp` to that month's sidebar note
(`CalendarService.seedMonthNote`, shipped as "prefill then edit" - see the older entry
"Calendar: graduation category, address privacy, auto-seeded footer notes", which is now historical).

In practice the note filled up with a restatement of the grid. Every event was echoed into the
footer whether it belonged there or not, and the admin's job became deleting lines rather than
writing them. The note is hand-written commentary *about* the month; the grid already lists what is
in it. The 1:1 mapping was the whole problem - the same shape of mistake the Locations strip had.

Removed `seedMonthNote`, `buildSeedLine`, and `TestBuildSeedLine`. The month note is now only ever
written by the admin through `PUT /calendar/months/:year/:month/note`. Two repository comments that
cited `seedMonthNote` as the reason the raw-locale read path exists were corrected - that path still
has real callers (the `UpdateEvent` PATCH diff, and `UpsertMonthNote` reading the prior note's
`source_locale`), so `calendarRawRead` stays.

Existing notes are untouched. Any auto-seeded lines already in a note remain until an admin edits
them out, since nothing here rewrites stored content.

## 2026-08-01 - Calendar places: the Locations strip lists venues, named by AI

The calendar's Locations strip mapped 1:1 over every event carrying an address, printing
`{day} {title} - {address}`. Four May events at the church printed the church four times - and since
the strip is deliberately **not** `data-export-hide`, that repetition went into the PNG shared to
Discord. The paper calendar the congregation already reads gets this right: its footer names each
place once (`Church Address: 101 Main St...`, `Friday Bible Study: Chris & Sebs - 39 Bridle Ridge Dr`).

**The modelling insight, which came from the owner.** A place name is a *function of its address* -
two different places cannot share one. An earlier draft of this plan stored a hand-typed `place_name`
on each event so dedupe could compare addresses while ignoring names; that was unnecessary, because
deduping by address already dedupes the name. Storing the name against the **address** instead makes
dedupe structural (a group-by on a foreign key) and - the part that actually matters - means the
model is asked "what is this place called?" **once per address for the life of the church**. One
address can therefore only ever carry one name: the church cannot be "Church" in May and "Church
Renovation" in June.

**What the model is buying.** Given `Friday BBS Chris & Sebs` → `Chris & Sebs`;
`Church Clean up/renovation` → `Church`; `Youth Camp` → `Youth Camp`. Sometimes the activity word
*is* the venue, sometimes the event name *is* the destination. No regex separates those.

Phase 1 - Database (`000014`):

| File | Change | Why |
|---|---|---|
| `migrations/000014_calendar_places.up.sql` | `calendar_places (address_key unique, address, name, name_source)` + `calendar_events.place_id` FK + seeds the `place_name` system prompt | `address_key` carries the UNIQUE constraint, so "same place" is a database guarantee. `ON DELETE SET NULL`, never CASCADE - removing a place must not take events with it. No backfill: pre-`000014` events render address-only until next saved |

Phase 2 - Normalization (`internal/model/address.go`, TDD-first):

`NormalizeAddressKey` folds diacritics (matching `SlugifyEventType`), drops apostrophes without
splitting words, treats punctuation as whitespace, drops a trailing ZIP, and expands street-type,
directional, unit and US state abbreviations. **The two failure modes are not symmetric and the tests
are weighted accordingly**: failing to collapse two spellings leaves a duplicate row (today's
behaviour), while collapsing two different addresses prints the wrong family's house in the exported
PNG. So it folds only what is unambiguous - `St Mary's Church Rd` folding `St` to "street" rather
than "Saint" is a known, accepted miss.

`CT` is Connecticut in `Hartford, CT` and Court in `8 Bridle Ct`. The state table is consulted for
the final token only, then **falls through** to the street table. That fallthrough is load-bearing:
without it a bare `101 Main St` never matches `101 Main Street`, which the seeded dev data
(`123 main st`) hit immediately. Caught by a probe, not by review.

Phase 3 - Resolution + the model call:

| File | Change | Why |
|---|---|---|
| `internal/translation/translator.go` | `Complete(ctx, promptKey, userText, maxTokens)` | A seam, not a second Gemini client: same key, endpoint, TTL'd prompt cache and `finishReason` truncation check, none of `TranslateField`'s hashing or persistence. A place name is a one-shot question, not a translation |
| `internal/service/place_namer.go` | `placeResolver.resolve()` (sync, never calls the model) and `.name()` (the call) | Splitting them is what makes "a known address costs zero API calls" an assertion in a test rather than a hope, and puts the goroutine in the service where it is visible |
| `internal/service/calendar.go` | Naming runs fire-and-forget on `context.Background()` | An admin saving an event must never wait on Gemini; an outage must never fail a save. Same shape as the fine-tuning capture |

Three invariants, each pinned by a test: a known address costs no model call; `WHERE name_source =
'ai'` means an admin rename is permanent; the place is created with the event title as a provisional
name *before* the call, so any failure degrades to something printable rather than a blank row.

`placeNameMaxTokens = 2048` for a one-to-four-word answer is **deliberate** - Gemini 2.5 thinks by
default and thinking tokens count against `maxOutputTokens`. See known-quirks
("Vietnamese AI translations truncated to a single word"). Do not tune it down.

Phase 4 - API + display: the month read `LEFT JOIN`s `calendar_places`, and `lib/places.ts` groups on
`place.id`. **Deliberately a plain group-by, not address matching** - two spellings already arrive
with the same id, and a second normalizer in TypeScript would silently drift from the Go one. The day
and event title are gone from each row (both are in the grid above; repeating them caused the
duplication), which removed the unambiguous click target - so a row is click-to-edit only when it
stands for exactly one event, and the rest are edited from the grid.
`place` and `place_id` are stripped for non-admins under **exactly** the same condition as
`private_address`: `"MST House"` identifies a household as precisely as its street number.

Phase 5 - Admin control: `PATCH /calendar/places/:id` is the *only* correction path, and it has to
exist - the answer renders publicly and re-typing the address resolves back to the same place by
design. It sets `name_source='admin'`, permanently locking the naming worker out, and one rename
relabels every event at the address. `GET /calendar/places` backs the event form's suggestions;
picking one **prevents** a duplicate rather than hiding it, since normalization cannot fold a genuine
typo (`10 Main St` for `101 Main St`). Both routes are admin-only, unlike the public event-types and
palette reads, because they return addresses regardless of `address_public`.

**Dropped from the plan:** a "same place as X" hint on address blur. It would require the frontend to
decide address identity - the exact drift avoided everywhere else. The suggestion dropdown covers the
need.

Cost: one Gemini 2.5 Flash call per never-before-seen address. A congregation with a handful of
venues makes single-digit calls per year; every repeat is an indexed lookup. Without `GEMINI_API_KEY`
addresses still resolve and dedupe, places just keep the provisional name - same opt-in degradation
as the translation worker.

Verified: `go build`/`go vet`/`go test ./...`, `tsc --noEmit`, `npm run build`, `test:color` 8/8,
`test:places` 12/12. Plus throwaway probes against the local dev Postgres, since fakes prove nothing
about SQL: migration up/down/up with events intact, `ON DELETE SET NULL`, `ON CONFLICT DO NOTHING`,
the admin-name guard refusing an AI overwrite, both month read paths scanning and joining, a
title-only PATCH keeping its `place_id`, and one rename relabelling every event at the address. Two
bugs were caught this way that review had missed: the bare-address fallthrough above, and a nested
place serializing `"created_at": "0001-01-01T00:00:00Z"` because the join selects only three columns.

**Untested until it reaches an environment with a key:** no real Gemini call has run. The prompt's
accuracy on actual event titles is unproven - worth watching on the first few real events.

## 2026-07-29 - Dismiss a pending translation without re-queueing it

The review panel had two ways to clear a pending row: approve it, or retranslate it (delete + re-enqueue). Neither fit "the source no longer needs a translation but I don't want a fresh one either" - e.g. clearing a calendar month note's text leaves the old translation of the previous content behind, because `UpsertMonthNote` upserts the same `(year, month)` row rather than deleting it, so it's not an orphan by the cleanup sweep's definition (parent row still exists). Added `Dismiss`: delete the translation row, don't touch the queue. Built TDD-first per the AGENTS.md workflow (handler test → service → handler → route → UI → docs); no repository change needed since `GetByID`/`Delete` already existed for the `Retranslate` path.

| File | Change | Why |
|---|---|---|
| `backend/internal/handler/admin_translations_test.go` | `Dismiss` added to the mock service; success / missing-id / not-found / service-error tests | TDD rule |
| `backend/internal/service/translation.go` | `Dismiss(ctx, id)` - fetches then deletes via the existing repo methods, no `s.enqueue` call | The one difference from `Retranslate`: no requeue is the entire point |
| `backend/internal/handler/admin_translations.go` + `cmd/server/main.go` | `Dismiss` handler + `DELETE /admin/translations/{id}` (admin group) | `DELETE` fits "remove this row" better than the `POST`-action routes used for retranslate/cleanup, which both do more than a plain delete |
| `frontend/lib/translations.ts` | `dismissTranslation` helper | Mirrors `retranslateTranslation`'s shape |
| `frontend/components/features/admin/TranslationReviewRecord.tsx` | Per-field "Dismiss" button next to "Re-translate", visible only while the field is unapproved; confirmed via `useConfirm()` | Dismissing already-approved (human-reviewed) output isn't a meaningful action, so it's scoped to pending rows |
| `frontend/app/[locale]/admin/translations/page.tsx` | `handleDismiss` wrapper threading the auth token, passed down as `onDismiss` | Matches the existing `handleApprove`/`handleRetranslate` pattern |

Also documented in `docs/agents/known-quirks.md` ("Clearing a calendar month note leaves a stale translation that 'Clean up orphans' won't catch") since the gap this closes wasn't obvious from the code alone.

Verified: `go build ./...`, `go vet ./...`, and the full `go test ./...` suite all green; `tsc --noEmit` clean.

## 2026-07-28 - Admins can add calendar event types, custom colors, and "no icon"

The calendar's event editor had three **closed sets** an admin could never grow: `event_type` was a
Postgres enum, `color` was a 9-key allowlist in Go, and `icon` was an 11-key allowlist with no empty
option. Adding a category for next Easter meant a migration plus two deploys. All three now grow at
runtime.

**Design provenance.** Researched how the majors do this before building. Colors follow **GoodNotes**
(the owner's call): a preset grid plus a `+` that opens a full picker, where saving writes the color
back into a **shared** swatch grid for every admin - unnamed, because naming each swatch is ceremony
a church admin would not maintain. Types follow **Airtable/Linear**: a creatable combobox where a
typed label becomes a *global, reusable* option without leaving the form, because per-record free
text fragments ("Baptism" / "baptism" / "Baptism Service"). "No icon" follows **Notion/Asana**: a
dashed "None" tile leading the grid, since in a radio group it is a selectable state rather than a
clear action. Google Calendar's June 2026 custom-color release confirmed storing the hex **on the
event** rather than as a named entity.

Database (`000012`):
- `calendar_event_types` (slug PK, label, `default_icon`, `default_color`, `is_builtin`, sort) seeded
  with the six built-ins, carrying the icon/color pairs previously hardcoded in `EventModal`.
- `calendar_events.event_type` enum → **text + FK** (`ON UPDATE CASCADE ON DELETE RESTRICT`). The
  enum type is left in place, unused, so the down migration can cast back.
- `calendar_palette_colors` (hex UNIQUE, `CHECK (hex ~ '^#[0-9A-Fa-f]{6}$')`).

Backend: `IsAllowedCalendarColor` (named key **or** hex) replaces the map lookup; the closed `switch`
on `event_type` becomes a shape check, with existence answered by the FK plus a service pre-flight;
`SlugifyEventType` folds diacritics so `"Lễ Báp-têm"` → `le_bap_tem`. Both creates are **get-or-create**,
so two admins typing "Baptism" the same week converge on one type instead of near-duplicates.
Reads (`GET /calendar/event-types`, `GET /calendar/palette`) are public; writes are admin-gated.

Frontend: `lib/color.ts` expands one hex into the four values the calendar paints with. This is the
part worth remembering - the derivation is **two-sided**, because `EventChip` writes `text` on
`highlight` while `EventBanner` writes **white** on `text`. A custom color must clear 4.5:1 on both
pairs or it looks fine in the grid and unreadable in a multi-day ribbon. A fixed darkening step does
not work (yellow at a given lightness is far brighter than blue), so the ramp walks lightness down
until both hold. `resolveColor()` is now the single entry point for all six render call sites.

Security: the color reaches an inline `style` attribute, so it is validated three-deep - regex in the
Go model, `CHECK` on the table, and React's escaping. Verified live that a `red; background-image:url(x)`
insert is rejected by the CHECK and an unknown `event_type` by the FK.

Known gaps (deliberate): custom type labels are **not translated** (the pipeline covers event title
and notes only), so a custom category shows its English label on `/vi` - the built-ins have the same
limitation. And `event_type === 'birthday'` still drives *layout*, not just styling (cake marker,
two-row cell budget, sidebar strip), so a custom birthday-ish type gets its icon and color but not
the cake treatment. Would need a `layout_hint` column if that ever comes up. No rename/recolor/delete
for types yet, per the owner's "add only for now" call.

## 2026-06-25 - Inline images in post bodies (+ images ride along to Discord)

Post bodies can now hold **inline images**, positioned anywhere in the text flow (drop / paste /
toolbar), unlimited on the website. An image dropped into the editor shows **instantly** (a blob-URL
placeholder at the cursor), uploads to a public R2 prefix, then swaps to its permanent URL. On
**create**, a post's inline images are also sent to its Discord message as **file attachments** -
rendered after the text (Discord can't interleave them; "option a"), capped at Discord's
**10-attachment** limit, best-effort. The External Link field is unchanged (kept per the owner's
call). **No DB change** - images live as `<img>` in the body HTML.

Backend:
- `POST /uploads/image` (admin): store a body image under `images/body/` (public prefix), return its
  permanent public URL. Not tied to a post, not in `post_images`. Requires `R2_PUBLIC_URL`.
- discord `serializer.go` strips `<img>` from the text + `ExtractImageURLs`; `attachments.go`
  `FilesFromURLs` downloads them from R2; `send.go` gained a multipart path; the post service
  attaches them on create.

Frontend:
- `@tiptap/extension-image` (pinned `3.23.1` to match core); `RichBodyEditor` gained the image node,
  drop/paste/toolbar upload, and the placeholder-swap UX with an "uploading… wait to save" note.
- `sanitizeBody.ts` allows `<img>` with `src`/`alt`, scheme locked to **https** (blocks
  `data:`/`javascript:`/http mixed-content). Body images styled in `globals.css` + the editor module.

Known edges (deferred): saving mid-upload drops a not-yet-swapped blob image (the banner warns);
orphaned R2 objects on image removal / post delete aren't cleaned up; Discord images are fixed at
create (edit updates text only) and don't interleave between paragraphs.

Verified: backend `go build`/`test`/`vet` green; frontend `tsc`/`eslint`/`next build` green.

## 2026-06-25 - Upcoming / Past events redesign (manual archive + swipeable Past carousel)

The homepage and `/events` now split events into an **Upcoming** feed and a horizontally
swipeable **Past** carousel below it. Two problems drove this: (1) a dateless event used to
vanish from the homepage entirely (the old filter discarded a null `event_date` before the date
check), and (2) there was no way to retire an event from "Upcoming" on the admin's terms. The
model chosen with the owner is **hybrid**: a dated event auto-drops to Past once its date passes,
and a new manual `archived_at` flag lets an admin move any event (dated or dateless) between
sections via `EventArchiveButton` on each card. Classification lives in one shared, pure helper
(`lib/events.ts` → `partitionEvents`) so the two pages can never disagree. Built phase-by-phase
(DB → backend TDD → frontend logic → UI → docs); `go test ./...`, `tsc`, and eslint all green.

| File | Change | Why |
|---|---|---|
| `backend/migrations/000007_post_archived_at.{up,down}.sql` | `posts += archived_at timestamptz` + partial index `where archived_at is not null` | Persistent, shared "moved to Past" state; the timestamp doubles as the Past-carousel sort key |
| `backend/internal/model/types.go` | `Post.ArchivedAt`; new `SetArchivedRequest` | Surface the flag; archiving is its own request, not a content edit |
| `backend/internal/repository/posts.go` | `archived_at` in every read; new `SetArchived` (`CASE WHEN $2 THEN now() ELSE NULL END`) | Dedicated write - `UpdatePost`'s COALESCE can't reset a column to NULL |
| `backend/internal/service/posts.go` | `SetArchived` pass-through, **no Discord side effect** | Archiving changes site grouping only, not the message already sent |
| `backend/internal/handler/posts.go` + `posts_test.go` | Extracted `postService` interface; `Archive` handler; 5 handler tests | The interface makes the handler mockable (it had no test before) |
| `backend/cmd/server/main.go` | `PATCH /posts/{id}/archive` inside `RequireAdmin` | Privileged mutation |
| `frontend/lib/events.ts` | `partitionEvents` / `isUpcoming` / `canUnarchive`, pure | One source of truth for both pages |
| `frontend/lib/{types,posts}.ts` | `archived_at` on `Post`; `setPostArchived` | Mirror the field + typed call site |
| `frontend/components/features/posts/{PostCard,PastEventsCarousel}.tsx` | "Date TBD" chip + archive button on cards; native scroll-snap carousel | Visible UI; a dateless event reads as intentional |
| `frontend/components/features/admin/EventArchiveButton.tsx` | Admin-only "Move to Past/Upcoming" | The manual move control |
| `frontend/app/[locale]/{page,events/page}.tsx` | Upcoming feed + Past carousel on both | The two-section layout |

Migration `000007` applies on the next backend boot against a DB (local `go run` or the next
Render deploy) - until then `archived_at` does not physically exist.

## 2026-06-22 - Discord posts as the real admin (per-admin identity + clean edit/delete) - backend

Replaced the single generic-bot webhook with a system where a post appears in Discord as **one
plain message under the writing admin's own Discord name + avatar**, and editing/deleting the post
updates/removes that same message. Webhooks override `username`/`avatar_url` per message, so one
webhook per channel serves every admin. Identity comes from a one-time Discord OAuth link
(`identify` scope) stored on the admin row; unlinked admins fall back to `display_name` + a default
avatar, so posting always works. Decisions for this first cut (with the project owner): **text only**
(album photos upload after create, so attaching them is deferred) and **embeds removed** (every type
is now plain content; bare external links auto-unfurl). Delivery stays best-effort: a Discord failure
logs and never fails the website request. Built TDD-first (identity / mentions / send / state / OAuth
handler tests). Frontend (link card + composer note + @everyone box) is the separate commit 2.

| File | Change | Why |
|---|---|---|
| `backend/migrations/000006_discord_identity.{up,down}.sql` | `admins` += `discord_user_id/username/avatar_url`; `posts` += `discord_message_id/channel_key` (all nullable) | Somewhere to store linked identity + which message/webhook a post went to, for edit/delete |
| `internal/discord/identity.go` | `IdentityForAdmin` - linked identity or display-name/default fallback | One place decides the per-message sender; unlinked admins still post |
| `internal/discord/mentions.go` | `AllowedMentions` default `{parse:[]}` + `EveryoneMention()` | Stray `@everyone` in a body never pings unless the per-post box is ticked |
| `internal/discord/send.go` | `Send` (POST `?wait=true`, returns id), `Edit`, `Delete` by id; 404-on-delete = success | The single-message send/edit/delete-by-id mechanism; `?wait=true` is what yields the id |
| `internal/discord/oauth.go` + `state.go` | OAuth `identify` exchange + `/users/@me`; HMAC-signed, 10-min `state` | One-time linking; the public callback trusts the signed state, not a Bearer token |
| `internal/discord/webhook.go` | Deleted embeds/color table/`buildEmbed`; `BuildContent` (plain, all types) + `WebhookForType`/`WebhookByKey` | Plain content for every type; bare links unfurl; channel mapping retained for edit/delete |
| `internal/repository/{admins,posts}.go` | `GetByEmail`, `SetDiscordIdentity`; `SetDiscordMessage`, `GetDiscordRef` | Identity at post time; message ref kept off the public read SELECTs |
| `internal/service/posts.go` | `Create` resolves identity by email → send → persist id; `Update` edits; `Delete` reads ref then deletes message - all detached, best-effort | Orchestration with a background context (request ctx is gone once the handler returns) |
| `internal/handler/{posts,discord_oauth}.go` | `Create` passes admin email; `LinkStart`/`Status` (admin) + `Callback` (public) | Wire identity through; expose the link flow |
| `cmd/server/main.go` | `SetAdminLookup`, build OAuth handler, register routes (callback **public**) | The public callback must stay outside `RequireAdmin` or OAuth breaks |

New env (Render): `DISCORD_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`, `DISCORD_OAUTH_STATE_SECRET`; reuses
`FRONTEND_ORIGIN` for the post-callback redirect. All optional - the link flow returns 503 when unset
and the rest of the app is unaffected. `go build`, `go test ./...`, `go vet ./...` all green.

## 2026-06-12 - Orphan cleanup for the translation engine (closes the "Phase 7" loose end)

When an admin deletes a post/page section/calendar event, its translations lingered forever (the `translations` table has no FKs by design) and cluttered the review panel with `posts:a1b2c3d4`-style labels. Now a "Clean up orphans" button on `/admin/translations` sweeps them. Built TDD-first per the AGENTS.md workflow (handler test → repository → service → handler → route → UI → docs).

| File | Change | Why |
|---|---|---|
| `backend/internal/handler/admin_translations_test.go` | New test file: mock `adminTranslationService`, tests for success / zero-count / service-error | TDD rule; the handler package previously had no translations tests |
| `backend/internal/repository/translation.go` | `DeleteOrphanedTranslations` + `DeleteOrphanedPendingJobs`, sharing an `orphanConditions` whitelist of the four known table_names | Whitelist over blacklist: an unrecognized `table_name` (future content type) is never swept, so the cleanup can't eat valid translations it doesn't understand. Pending jobs must be swept too or the worker re-creates the orphan ~5s later; done/failed jobs stay as audit history |
| `backend/internal/service/translation.go` | `CleanupOrphans` - jobs first, then translations | Sweeping jobs last would leave a window where a just-drained job re-creates an orphan the sweep already deleted |
| `backend/internal/handler/admin_translations.go` + `cmd/server/main.go` | `CleanupOrphans` handler + `POST /admin/translations/cleanup-orphans` (admin group) | Returns 200 (not 202) - the sweep is synchronous, counts are final |
| `frontend/lib/translations.ts` + `app/[locale]/admin/translations/page.tsx` | `cleanupOrphanTranslations` helper + "Clean up orphans" button beside "Re-translate all pending", with a confirm that names exactly what gets deleted | Human-triggered, matching the review panel's human-in-the-loop philosophy; orphan volume at church scale never justifies an automatic background sweep |

Deliberately NOT swept: `fine_tuning_examples` - captured training pairs are designed to survive parent deletion.

Verified: 3 new handler tests pass; SQL exercised against the local Docker Postgres in a rolled-back transaction (orphans deleted including approved ones, unknown table_name kept, failed job kept); `tsc --noEmit` clean.

## 2026-06-11 - Fine-tuning data capture pipeline (additive, zero behavior change)

Every admin approval on `/admin/translations` now silently captures a gold (English source, approved Vietnamese) pair into a new `fine_tuning_examples` table - the dataset for a future LoRA fine-tune of an open-source translation model (full roadmap: `docs/FINE_TUNING_PLAN.md`). Nothing in the serving path changed; the existing translation engine's design rules are untouched.

### Phase 1 - Database

| File | Change | Why |
|---|---|---|
| `backend/migrations/000005_fine_tuning_examples.up.sql` | New `fine_tuning_examples` table (`source_en`, `approved_vi`, `content_type`, `source_field`, `record_table`, `record_id`, `approved_by`, `used_in_training`, `training_run_id`). Partial index on `used_in_training = false`; unique index on `(record_id, source_field, record_table)` | The table IS the dataset. The unique index makes capture idempotent (double-approve = no-op); the partial index keeps exporter scans cheap as consumed rows pile up. No FKs - a deleted post must not delete its training pair, matching the `translations` convention |
| `backend/migrations/000005_fine_tuning_examples.down.sql` | `drop table if exists` | Reversibility in dev, matching every other migration pair |

### Phase 2 - Backend

| File | Change | Why |
|---|---|---|
| `backend/internal/repository/finetuning.go` | `FinetuningExample` struct + `CaptureFinetuningExample` on `TranslationRepository`: `INSERT ... ON CONFLICT (record_id, source_field, record_table) DO NOTHING` | Repository owns the raw SQL (3-layer rule); ON CONFLICT means the call never errors on duplicates |
| `backend/internal/service/translation.go` | After `repo.Approve` succeeds, `captureFinetuningExample(t)` fires a goroutine with `context.Background()` that logs failures and never returns them | Same fire-and-forget pattern as the translation enqueue. Approval is mandatory, capture is best-effort. One hook covers both approve-as-is and edit+approve because both flow through `Approve` - and the repo's `RETURNING` already hands back `source_text` + final `translated_text`, so no extra query |

### Phase 3 - Export tooling

| File | Change | Why |
|---|---|---|
| `scripts/export_training_pairs.py` | Pulls `used_in_training = false` rows + the live `vi_translation` system prompt, writes HuggingFace SFTTrainer JSONL (`system`/`user`/`assistant` messages + metadata) to `fine_tuning_data/training_YYYY-MM-DD.jsonl`. `--dry-run` prints count breakdowns only. Deliberately never flips `used_in_training` | Pairs leave the DB in exactly the format the future training notebook consumes, carrying the same system prompt the model will see at inference. Re-export stays lossless; marking pairs consumed is the training run's job |
| `.gitignore` | `fine_tuning_data/` | Dataset artifacts, not source |

### Phase 4 - Documentation

`docs/FINE_TUNING_PLAN.md` (why Qwen2.5-7B-Instruct, the Southern-dialect rationale, Phases 0-3 with eval gates), `docs/agents/database.md` (table doc + migration list), `docs/agents/backend.md` (folder map + capture section), `AGENTS.md` (routing rule).

### Architecture notes (resume bullets)
- **Human-in-the-loop review doubles as dataset labeling.** The approval flow the admins already use produces training pairs as a free side effect - no separate annotation workflow, no extra UI.
- **Best-effort side effects stay off the critical path.** Capture mirrors the engine's enqueue pattern: goroutine + `context.Background()` + log-and-swallow. An INSERT failure can never fail an approval.
- **Idempotency via constraint, not application logic.** `ON CONFLICT DO NOTHING` against a unique index is the whole dedup story; no read-before-write race.

### Current status / next trigger
Phase 0 (collection) is live. Run `python scripts/export_training_pairs.py --dry-run` periodically; at 200+ pairs with a healthy content-type mix, start Phase 1 of `docs/FINE_TUNING_PLAN.md` (first LoRA experiment on Colab).
## 2026-05-20 - AI Church Assistant (VGOMNE Helper) with RAG Pipeline

Designed and built an intelligent, context-aware chatbot helper for church visitors. It retrieves church posts, events, announcements, and static page content dynamically using a robust search-fallback keyword-matching RAG pipeline, synthesized using Groq (llama-3.3-70b-versatile).

1. **Database Search & Fallback RAG (Go Backend):**
   - Added keyword-extraction service with a full stop-words list.
   - Built RAG search repository executing parallel-style keyword matches across `posts`, `calendar_events`, and `page_content` tables.
   - Added smart fallback search queries to automatically retrieve current upcoming events and recent announcements if the query contains no keyword match.
2. **Abuse Prevention & Rate Limiting:**
   - Implemented a per-IP rolling rate limiter (max 10 requests/minute) directly within the `AssistantService` and wired it into the HTTP handler.
   - Enforced a 1000-character maximum message limit in the HTTP validation.
3. **Public POST /assistant/chat Endpoint:**
   - Exposed a public endpoint `POST /api/v1/assistant/chat` requiring no authorization so any anonymous visitor can ask questions.
   - Designed response shape to include references (`Sources`) so visitors can instantly trace and verify facts back to the original church posts.
4. **Interactive Chatbox Widget (Next.js Frontend):**
   - Built a sleek, floating ChatBox widget featuring a terracotta FAB with a subtle pulse ring.
   - Renders a warm-toned 380x520px chat panel with micro-animations, Playfair typography, and a staggered bounce 3-dot typing indicator.
   - Displays four quick-question preset chips when empty so visitors can tap to instantly ask common questions.
   - Renders assistant response bubbles with clickable citation chips directing to the referenced church events/posts.
   - Handles connection errors and rate-limiting (429) cleanly with helpful user alerts.
5. **Robust Quality & Documentation:**
   - Verified that the Next.js production build passes with 100% success.
   - Added robust unit test coverage in `backend/internal/handler/assistant_test.go` covering success, invalid JSON, empty message, service error, and rate-limiting cases.
   - Documented the entire feature inside `docs/api.md`, `docs/components.md`, `docs/agents/backend.md`, and `docs/agents/frontend.md`.

---

## 2026-05-15 - Full AWS exodus to serverless ($0/month infrastructure)

Migrated the entire stack off AWS while keeping the live site reachable throughout. End state: zero AWS resources, zero monthly bill, same product. Each step was independently reversible.

1. **Database (RDS → Supabase Postgres).** Took a `pg_dump --no-owner --no-acl --schema=public -Fc` of the RDS instance from EC2, used `pg_restore --clean --if-exists` to replace the legacy Supabase project's `public` schema. Used the session pooler at `aws-1-us-east-1.pooler.supabase.com:5432` because Supabase's direct connection is IPv6-only and EC2 lacks IPv6. Cut over by editing `DATABASE_URL` in the systemd service file, then `daemon-reload && restart`. Discovered a rogue `/home/ubuntu/church-website/backend/.env` was overriding the systemd value via godotenv's fallback - renamed it `.env.bak-migration`. Also learned systemd treats `%` as a specifier prefix, so the URL-encoded `%40` (for the `@` in the password) had to be doubled to `%%40` on systemd; Render later took the same URL with a single `%40` because it doesn't have that quirk.
2. **Object storage (S3 → Cloudflare R2).** Added an `endpoint string` parameter to `storage.NewS3Client` in `backend/internal/storage/s3.go`. When `endpoint != ""`, the SDK gets a custom `BaseEndpoint` plus `UsePathStyle = true` - that combination redirects all PutObject/DeleteObject/PresignGetObject calls to R2 while keeping the existing function signatures. Set `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and bucket name in production env vars. One-time data migration: `aws s3 sync` from RDS-era EC2's IAM role into `/tmp/`, then upload from `/tmp/` to R2 using a separate `--profile r2 --endpoint-url <r2-endpoint>` (one set of credentials per `sync` call meant a two-step copy was simpler than rclone). 30 MB total, 5 hero mp4s.
3. **Backend (EC2 + systemd → Render).** Render auto-deploys from `master` via Docker. Copied all env vars from the EC2 systemd file to Render's dashboard (note: single `%40` here, not `%%40`). External cron-job.org ping keeps the free instance warm; without it, first request after 15 min of inactivity waits ~50 s for cold start.
4. **Frontend (EC2 + Nginx → Vercel).** Vercel auto-detects Next.js, builds from `frontend/` subdirectory. Hit `ERESOLVE` peer-dep conflict because `@emoji-mart/react` declares React 16/17/18 but we run 19. Fixed with `frontend/.npmrc` containing `legacy-peer-deps=true` - same flag GitHub Actions already used. Updated Render's `FRONTEND_ORIGIN` to the Vercel URL for CORS, and Supabase Auth's URL Configuration so OAuth callbacks work from the new origin.
5. **AWS cleanup.** Deleted RDS (after final snapshot). Emptied + deleted the S3 bucket. Revoked the IAM user access keys. Terminated EC2. Released the Elastic IP (the silent ~$3.50/month trap that AWS charges for unattached EIPs). Removed the `ChurchEC2S3Role` IAM role and custom security groups.
6. **DNS** stayed on No-IP's free `vgomne.ddns.net` pointing at the now-defunct Elastic IP. Custom domain on Vercel is available as a future polish (A record to `76.76.21.21` + optional `vercel.json` rewrite to proxy `/api/*` to Render, eliminating CORS) but was deferred to keep the migration focused on cost.

### Lessons / architectural notes (resume bullets)
- **Serverless cutover patterns:** built each new platform alongside the old one, verified equivalence, then flipped one config line at the boundary. Total downtime: zero.
- **Single source of truth for environment variables matters:** the rogue EC2 `.env` overriding systemd taught me that "have config in two places" is how you get hours of mysterious bugs. godotenv's gap-filling behavior is convenient until it's invisible.
- **S3-compatible APIs are real:** the same `aws-sdk-go-v2` code drives both AWS S3 and Cloudflare R2 with one boolean flag (`UsePathStyle`) and one URL override (`BaseEndpoint`). No rewrites required when changing providers.
- **systemd specifier escaping:** `%` is reserved in `Environment=` directives; doubled `%%` produces a literal `%`. URL-encoded passwords are the classic gotcha.

### Cost impact
- Before: ~$22/month (EC2 t4g.micro + RDS db.t4g.micro + S3 + EBS + occasional EIP). ~$264/year.
- After: $0/month. All services on free tiers comfortably within their quotas for a pre-launch church site.

## 2026-04-27 - `$impeccable document` (DESIGN.md + DESIGN.json)

1. Added repo-root **`DESIGN.md`** (Stitch-style YAML frontmatter + six body sections: Overview, Colors, Typography, Elevation, Components, Do's and Don'ts) extracted from **`frontend/app/globals.css`**, home hero in **`app/page.tsx`**, **`PostCard`**, **`Navbar`**, aligned with **PRODUCT.md** guardrails.
2. Added **`DESIGN.json`** sidecar (`schemaVersion` 2): tonal hints, shadow/motion/breakpoint extensions, three self-contained **`ds-*`** CSS snippets for panel preview, narrative mirror of rules and do/don't lists.
3. Ran **`load-context.mjs`** so future impeccable runs see **`hasDesign: true`**.

## 2026-04-27 - `$impeccable craft home` (PRODUCT palette + hero)

1. **`globals.css`:** Replaced navy-first tokens with **PRODUCT** values: cream **`#faf7f2`**, ink **`#1c1a18`**, **terracotta** primary **`#c4663c`**, **sage** accent **`#4a7a5c`**, warm **`#eae5de`** borders, warm off-white **`#fffefb`** surfaces; dark mode uses **warm charcoal** (no blue primary). Page fade uses **cubic-bezier(0.22, 1, 0.36, 1)** (ease-out style).
2. **`app/page.tsx`:** Hero is **`#1C1210`** with **radial terracotta glow**, **bottom gold–terracotta rule** at 40% opacity, **no photo**; eyebrow, Playfair **`h1`**, body line, and **two CTAs** (terracotta fill + ghost outline). Error alert **no drop shadow**; **`rounded-[14px]`** on alert.
3. **`Navbar`:** Header **`bg-background/95`**, backdrop blur removed (PRODUCT / impeccable glass ban).
4. **`PostCard` / `PostFeed`:** Warm badges, **14px** radius, **shadow only on hover**; titles **Playfair 600**.
5. **`layout.tsx`:** Metadata title/description aligned with ministry name.

## 2026-04-27 - Home layout (`arrange` / layout rhythm)

1. **Hero:** fluid vertical padding via **`clamp`**, inner **`max-w-[min(100%,40rem)]`** so type does not spray edge-to-edge on wide screens; slightly looser **margin** above the description.
2. **Below hero:** **asymmetric vertical rhythm** (tighter **pt** on `sm`, roomier on **`lg`**) instead of a single **`py-12`**; **error alert** gets **more bottom margin** when present.
3. **Sections:** **title row → feed** uses **`mb-4`** (tight grouping); **announcements vs events** separated by **`mt-16 sm:mt-20 lg:mt-24`** instead of uniform **`space-y-12`**.
4. **Section headers:** **`items-baseline`**, **`gap-x-6 gap-y-3`**, **`h2` with `flex-1`**; **“View all”** uses **`self-end` on small screens** when the row wraps so the control stays visually anchored.

## 2026-04-27 - Home typography (`typeset` / PRODUCT scale)

1. **Playfair_Display** in `layout.tsx` now loads weight **600** for section-level serif headings.
2. **`app/page.tsx` hero:** eyebrow label (uppercase, terracotta, letter-spacing per PRODUCT), **Playfair** display `h1` with fluid **`clamp(2.25rem, 5.5vw, 4rem)`** (~36–64px), **tracking -0.025em**, **line-height 1.06**, one **italic terracotta** phrase in the title; hero description uses **sans** at **≥16px** with relaxed line-height and **max-width 65ch**.
3. **Section `h2`:** Playfair **600** at **xl / 2xl** with tight tracking; content column **max-width 760px** per PRODUCT layout; utility links explicitly **font-sans**.

## 2026-04-27 - Frontend hardening (home + global chrome)

1. **Skip link and main landmark:** First focusable control in `layout.tsx` skips to `#main-content`; `<main>` is focusable (`tabIndex={-1}`) with a visible `:focus` outline in `globals.css` and `scroll-mt` so content is not hidden under the sticky header.
2. **Navbar:** Desktop “News” is a disclosure (button `aria-expanded`, panel `id` + `aria-controls`), closes on Escape, outside mousedown, outside `focusin`, and blur leaving the dropdown container. Mobile panel stays in the DOM with the `hidden` attribute, wired to the menu button via `aria-controls`. Touch targets use **min 44px** height on primary controls.
3. **Motion and focus:** `prefers-reduced-motion` disables the page fade animation; `:focus-visible` outline rules apply to interactive elements.
4. **Home (`page.tsx`):** Supabase errors surface a `role="alert"` banner with recovery **Link** to `/`; section headings use `aria-labelledby`; heading rows tolerate long copy (`min-w-0`, `break-words`); “View all” links meet minimum tap height.
5. **PostCard:** Event date prefix emoji is `aria-hidden` so assistive tech does not announce it separately from the date string.

## 2026-03-28 - JWT middleware migration (ES256 / Supabase JWKS)
1. Problem discovered:
   - Token header in requests contains `alg: ES256`, `kid: <uuid>`.
   - Middleware was validating with `[]byte(SUPABASE_JWT_SECRET)` from .env (HMAC flow), causing `ECDSA verify expects *ecdsa.PublicKey`.
2. Root cause:
   - Supabase currently issues ECDSA tokens (signed by private key), while code used symmetric key path.
3. Solution implemented:
   - Added `SUPABASE_URL` to `.env` to locate JWKS URL.
   - Added `internal/middleware/jwks.go`:
     - Fetch public keys from `.../.well-known/jwks.json`
     - Parse JWK ECC `x/y` coordinates to `*ecdsa.PublicKey`
     - Cache keys for performance and key rotation safety.
   - Updated `internal/middleware/auth.go`:
     - Require `ES256` algorithm in signer callback.
     - Read `kid` from token header and resolve key by `jwksCache.GetKey()`.
     - Enforce token validity + email claim + admin table check.
   - Updated `cmd/server/main.go`:
     - Initialize JWKS cache on startup.
     - Fail fast if JWKS fetch fails.
     - Pass cache into RequireAdmin.
4. Test result:
   - Backend now starts and prints `Loaded 1 ECDSA keys from Supabase JWKS`.
   - `curl` against /api/v1/posts (with valid auth) should now pass signature check.

## Architecture notes (resume bullets)
- Designed and shipped secure JWT verification for Supabase in Go using JWKS and ECDSA.
- Built middleware with proper separation: token extraction, auth validation, role lookup.
- Implemented project-wide consistency in docs and architectural reference.

## Metrics and impact (to track)
- `jwt_validation_success_rate` (goal: 99.9%)
- `admin_auth_error_rate` (reduce invalid key errors to 0)
- Key refresh cadence: 1h (JWKS cache TTL)

## Next improvements
- Add automated tests for `RequireAdmin` with live mocked JWKS server.
- Add health endpoint for JWKS status.
- Add telemetry for token issuer/kid success/failure.

---

## Multi-day calendar events + banner ribbons (Phase 5a)

**Goal:** match the hand-made paper calendars' multi-day banners ("Youth Camp
May 22-25", "Church renovation"). An event optionally spans a date range and
renders as a ribbon across the days it covers.

**Design decisions:**
- **Creation UX:** structured modal, not drag. A "Multi-day event" toggle in
  `EventModal` reveals an "Ends on" date picker (min capped at the start). One
  creation flow, identical on desktop and mobile, no separate "mode." Explicitly
  rejected drag-to-create (discoverability, mobile scroll conflict, edit/a11y
  cost, highest bug surface) - the structured form fits the "organized, clean"
  goal better.
- **Data model:** one event row + nullable `end_date` (migration `000008`), not
  one row per day or a separate spans table. Keeps edit/delete trivial. `CHECK
  (end_date IS NULL OR end_date >= date)` is the hard guarantee; request
  validation + the frontend date-picker `min` are the friendly guards.
- **Month query → overlap:** `GetEventsByMonth` switched from `EXTRACT(MONTH)`
  equality to `date < first-of-next-month AND COALESCE(end_date, date) >=
  first-of-month`, so a span crossing a month boundary appears in both months.
- **Update writes `end_date` directly** (not COALESCE-guarded) so a span can be
  set *and* cleared back to single-day; safe because `EventModal` always submits
  the full event.
- **Rendering:** `CalendarGrid` splits single-day (`EventChip`) vs multi-day
  (`EventBanner`). Desktop is now per-week relative rows; banners are absolutely
  positioned by `grid-column` fraction with greedy lane assignment and per-week
  segments (round only true span ends). Mobile shows a compact chip on each
  covered day. `pointer-events-none` banners let clicks fall through to the day
  (day-click now matches by range).

**Drag-to-create (5b/5c) was dropped** - the modal makes it unnecessary.

---

## Calendar: graduation category, address privacy, auto-seeded footer notes

- **Graduation category** (migration `000009`, enum `ADD VALUE`): new event type with a `graduation-cap` icon, default amber.
- **Address public/private** (migration `000010`, `address_public bool` default false): an address is shown to the public site only when `address_public` is true; admins always see it; the PNG export always includes it (admin-driven). EventModal has a "Show on website" toggle + a reusable `InfoTip` ("?") explaining the export-always rule. Footer shows public addresses to everyone; admins see all with a `data-export-hide` "hidden" cue.
- **Auto-seeded footer notes (C2, keep-edit):** `CalendarService.CreateEvent` appends a one-line summary of every newly created event to that month's note (`buildSeedLine` → "• May 22-25: Youth Camp"). **Keep-edit:** append-only, deduped, never rewrites - so admin edits are never clobbered. Best-effort (never fails the create). Only NEW events seed (no retroactive backfill). Reuses `calendar_month_notes` (no new storage); the footer's `line-clamp-3` was removed so the full list shows. Decision: **every** event seeds (not just spans).
