## Scratchpad (deprecated for new features - use progress.md)

We are consolidating design/progress tracking into `docs/progress.md`.

`docs/progress.md` now contains feature-level design decisions, architecture notes, metrics, and implementation diary entries.

---

# ACTIVE PLAN - Flexible About page (block-based page content)

**Status:** awaiting approval. Nothing implemented yet.

## The problem

`/about` is *editable* but not *flexible*. Three separate places hardcode the same list of
sections, so adding "Our Pastors" or deleting "Our Story" means a code change in all three:

| Where | What is hardcoded |
|---|---|
| `frontend/app/[locale]/about/page.tsx` | the `defaults` map + one JSX `<section>` per topic |
| `frontend/app/[locale]/admin/pages/[slug]/page.tsx` | `PAGE_SCHEMA.about` - the fixed list of input fields |
| implicitly, the DB | `page_content` rows keyed by `section_key`, with no order and no type |

The admin can change *words*. They cannot change *structure*. And every body field is a bare
`<textarea>` - no bullets, no indent, no emphasis.

---

## Research - how the industry solves this

The general name for this problem is **content modeling**: moving from "a template with named
slots" to "a document made of typed, ordered blocks."

| Pattern | Who does it | The idea | What we steal |
|---|---|---|---|
| **Dynamic Zone / modular content** | Strapi (literally "Dynamic Zone"), Contentful (`Page` → array of section references), Prismic ("Slices") | A page field holds an *ordered array* of blocks chosen from a **whitelist of block types**. Admin adds/removes/reorders instances; they cannot invent a type the designer never styled. | This is exactly the ask. It gives freedom **inside a fence** - the page can never render un-designed markup. |
| **Block model** | Notion (one DB row per block: `type`, `parent`, `position`, `properties` JSON), WordPress Gutenberg (post body = serialized block list, each with `attributes`) | Content is *data*, not markup. Rendering is a **registry lookup**: `type → component`. | Adding a block type later = one registry entry + one renderer. Never a new page template. |
| **Server-driven UI** | Airbnb, Lyft, Meta ("Bloks"), Spotify | Server returns a typed section list; the client maps each to a component and **silently skips types it doesn't know**. | Forward-compat rule: an old cached frontend must never white-screen because the DB grew a new block type. |
| **Stable per-block IDs** | Contentful/Sanity keep a `_key` on every array item; Notion uses block UUIDs | A block's identity survives reordering and editing, so relations pointing at it (translations, anchors, analytics) don't break. | **The single most important constraint for us** - see below. |
| **Fractional indexing / LexoRank** | Figma, Jira, Notion | Order is a sortable value *between* neighbours, so moving one item rewrites one row instead of N. | Noted and deliberately **not** used - a page has ~8 blocks and is saved as a whole. Plain `position int`, reindexed on save, is simpler and correct here. |
| **Constrained rich text** | Sanity Portable Text, Contentful Rich Text (JSON, not HTML) | The body is a restricted document, not arbitrary HTML, so the design system stays in control. | Already solved here by `lib/sanitizeBody.ts` allow-lists. We reuse it and just narrow the *toolbar*. |

### Why the "one JSON document per page" model (Sanity/Contentful style) is wrong *for us*

The tempting version is: one `page_content` row per page, with a `blocks jsonb` column.
Atomic saves, trivial reorder. But this codebase's translation engine is **row-oriented**:

- `translations.record_id` points at a `page_content.id`, with `unique (record_id, field_name, locale)`
- `/admin/translations` labels each record as `page_slug / section_key` (`repository/translation.go:49`)
- the orphan sweep joins `translations.record_id = page_content.id` (`translation.go:268`)

Collapsing to one row per page would force translation keys to become JSON paths
(`blocks[3].body`), thrash the `source_hash` cache on every reorder, and break the review UI.

**Key realisation: `page_content` is already 80% of a block model.** One row per section, each
with its own UUID. What's missing is order, type, a title field, a delete path, and a generic
renderer. So this is an *evolution of the existing table*, not a rewrite - and the translation
engine needs no structural change at all.

### Why Connect is deliberately left alone

Connect's fields are **structured data** (service day, time, street address, email), not prose.
Contentful draws exactly this line: structured fields stay typed fields; only prose becomes
modular content. Blockifying an address field would make it worse, not better. So:

- `about` → block-driven (this plan)
- `connect` → keeps its fixed typed form
- `GET /pages/:slug` returns **both** projections (`sections` *and* `blocks`) from the same rows,
  so Connect keeps working with zero changes.

---

## Block types (v1 - deliberately small)

| `block_type` | Renders as | Fields used | Why it exists |
|---|---|---|---|
| `hero` | Centered page title + subtitle, once at top | `title`, `content` (plain) | Every page needs exactly one; pinned, not deletable, not reorderable |
| `rich_text` | Card (`rounded-xl border bg-surface/50 p-8`) with optional `<h2>` + rich body | `title`, `content` (HTML) | The workhorse - Mission, Beliefs, Story, Values all collapse into this |
| `quote` | Pull-quote with attribution | `content` (HTML), `props.attribution` | Verse or testimony; visual variety without a new page template |
| `image` | Full-width image + caption | `props.url`, `props.alt`, `content` (caption) | Reuses the existing R2 upload path from `lib/uploads.ts` |

Bulleted "Values" is **not** a separate type - it is a `rich_text` block whose body is a `<ul>`,
which is exactly what the new toolbar makes easy to author.

**Rule to hold the line on:** translatable text lives **only** in `title` and `content`.
`props` is for configuration (urls, variants, attribution), never for prose - the translation
worker will not see it.

---

## Phase 1 - Database

Migration `backend/migrations/000011_page_blocks.{up,down}.sql`.

| File | Change | Why |
|---|---|---|
| `000011_page_blocks.up.sql` | `alter table page_content add column block_type text not null default 'rich_text'` | The discriminant. Renderer + editor both switch on it; a default keeps every existing row valid. |
| `000011_page_blocks.up.sql` | `add column position int not null default 0` + `create index on page_content(page_slug, position)` | Order becomes data instead of JSX order. The index makes the ordered read one scan. |
| `000011_page_blocks.up.sql` | `add column title text not null default ''` | A block's heading stops being a *separate row* (`mission_heading`) and becomes a field of the block it belongs to. Halves the row count and makes "delete this section" one delete. |
| `000011_page_blocks.up.sql` | `add column props jsonb not null default '{}'::jsonb` | The escape hatch (Notion's `properties`, Gutenberg's `attributes`). New block types never need another migration. |
| `000011_page_blocks.up.sql` | **Backfill**: fold each `*_heading`/`*_body` pair into one row (`title` = heading text, `content` = body), assign `position`, mark `hero_*` as `block_type='hero'`, delete the now-empty `*_heading` rows | Existing content survives as sensible blocks instead of a pile of orphan fragments the admin has to clean up by hand. |
| `000011_page_blocks.up.sql` | **Re-point translations**: `update translations set record_id = <merged row>, field_name = 'title' where record_id = <old heading row>` before deleting it | Without this, every Vietnamese heading translation is orphaned and has to be re-generated *and* re-reviewed. Stable IDs are the whole point of the block model. |
| `000011_page_blocks.up.sql` | `values_item_1..4` → one `rich_text` block whose `content` is `<ul><li>…</li></ul>`; delete rows 2-4 and their translation rows | **Accepted loss:** the 4 value-item translations cannot be merged into one row, so they get re-translated once (one job, ~5s). Everything else is preserved. Currently these are still `TODO:` placeholders, so in practice the loss is zero. |
| `000011_page_blocks.down.sql` | Drop the four columns (content merge is not reversed) | Honest down-migration; documents that the merge is one-way. |

Written idempotently (`if not exists`, `on conflict do nothing`) so it is safe on a dev DB that
was never seeded and on prod where content may exist.

---

## Phase 2 - Backend

TDD per AGENTS.md: `handler/pages_test.go` cases first (list blocks, replace blocks, empty
payload → 400, unknown block_type → 400, service error → 500), then the layers.

| File | Change | Why |
|---|---|---|
| `internal/handler/pages_test.go` | New mock methods + tests for the block read/replace paths, incl. the delete case | Step 1 of the workflow - the code should not compile yet. |
| `internal/model/types.go` | `PageBlock{ID, BlockType, Position, Title, Content, Props map[string]any}` | Declares the shape once so handler, service and repo agree. |
| `internal/repository/pages.go` | `GetBlocks(ctx, slug, locale)` - ordered by `position`, with **two** COALESCE joins (`field_name='title'` and `field_name='content'`) | Today's join only localizes `content`; block titles are now real translatable text and need the same treatment. |
| `internal/repository/pages.go` | `ReplaceBlocks(ctx, slug, blocks)` in one transaction: upsert rows present in the payload (by `id`), delete `page_content` rows for that slug **not** in the payload, plus their `translations` and `pending` `translation_jobs` | This is the "remove a field" capability. Cleaning translations inline is stricter than waiting for the manual orphan-sweep button, and reuses the exact semantics that button already implements. |
| `internal/repository/pages.go` | Server-side `section_key` generation for new blocks: slugify(title) with a dedupe suffix, **immutable after creation** | `section_key` stops being the identity (the UUID is) and becomes the human label shown in `/admin/translations` ("about / our-story"). Server-side so uniqueness is checked against the DB. |
| `internal/service/pages.go` | `GetPageBlocks`, `ReplacePageBlocks` - same pre-fetch/diff/enqueue flow as today, but enqueues `Fields: {"title": …, "content": …}` | The worker already loops over `job.Fields` generically (`translator.go:157`), so a second field costs nothing. Diffing still means untouched blocks fire no jobs. |
| `internal/handler/pages.go` | `pageResponse` gains `blocks []model.PageBlock`; `Update` accepts `{"blocks": [...]}` (full replace) **or** `{"sections": {...}}` (partial upsert, unchanged) | One endpoint, two projections. Connect and any cached frontend keep working byte-for-byte; About opts into the new shape. |
| `internal/handler/pages.go` | Validate `block_type` against a server-side allow-list | The fence. A client can never persist a type the renderer has no component for. |
| `cmd/server/main.go` | No change | Routes already exist; only the payload grew. |
| `docs/api.md`, `docs/agents/backend.md`, `docs/agents/database.md` | Document the new columns, response field, request shape, model type | AGENTS.md API + component documentation rules, same commit. |

---

## Phase 3 - Frontend: the block builder + lighter editor

| File | Change | Why |
|---|---|---|
| `frontend/lib/pages.ts` | `PageBlock` interface, `getPageBlocks(slug, locale)`, `replacePageBlocks(slug, blocks, token)` | Keeps the transport wrapper thin, matching the existing file's stated role. |
| `frontend/components/editor/toolbar/PersistentToolbar.tsx` | Add a `variant?: 'full' \| 'lite'` prop that hides image/callout/emoji/colour/highlight controls | Per the "extract shared shells first" rule - one toolbar with a variant, **not** a second copy that drifts. |
| `frontend/components/editor/RichBodyEditor.tsx` | Accept `variant`; in `lite` drop the Image/Callout/Color/Highlight extensions and the drag-drop upload wiring | A page section does not need a full post composer. Fewer extensions = smaller surface + faster mount. |
| `frontend/components/editor/extensions/Indent.ts` *(new)* | Small extension adding an `indent` attribute (0-4) to paragraph/heading, rendered as inline `margin-left` | **Bullet nesting** already works for free via Tiptap's `sinkListItem`/`liftListItem` (Tab / Shift+Tab). True *paragraph* indent does not exist in StarterKit and needs this. |
| `frontend/lib/sanitizeBody.ts` | Allow `margin-left` in `allowedStyles` alongside `text-align` | The sanitizer is the single source of truth for paste/save/render - if indent isn't allow-listed there, it is silently stripped on save. |
| `frontend/components/features/admin/PageBlockEditor.tsx` *(new)* | The builder: block list with **+ Add section** (type picker), **Remove** (with confirm), **↑ / ↓** reorder, title input + `RichBodyEditor variant="lite"` per block | This is the actual deliverable - add, remove, reorder, format. |
| `frontend/app/[locale]/admin/pages/[slug]/page.tsx` | `about` renders `PageBlockEditor`; `connect` keeps `PAGE_SCHEMA` | Deliberate split from the research above: prose gets blocks, structured data keeps typed fields. |
| `frontend/lib/unsaved-changes.tsx` | Wire the builder into the existing guard | Reordering + editing 8 blocks then navigating away must not silently lose work. |
| `docs/components.md`, `docs/agents/frontend.md` | Document `PageBlockEditor`, the `variant` prop, the `Indent` extension | Component documentation rule. |

### Lite toolbar contents

Keep: paragraph / H3 / H4 · **B** *I* <u>U</u> · bullet list · numbered list · indent · outdent ·
link · align left/center · clear formatting.
Drop: images, callouts, emoji picker, text colour, highlight, code block, horizontal rule.

Rationale: block titles already render as `<h2>`, so in-body headings start at H3 - that keeps
the public page's heading outline valid for screen readers and SEO.

---

## Phase 4 - Display

| File | Change | Why |
|---|---|---|
| `frontend/components/features/pages/PageBlocks.tsx` *(new)* | Server component holding the registry `{ hero, rich_text, quote, image } → component`, **skipping unknown types** | The server-driven-UI rule. A block type added later renders as nothing on a stale deploy instead of crashing the page. |
| `frontend/app/[locale]/about/page.tsx` | Replace the four hardcoded `<section>`s with `<PageBlocks blocks={blocks} />`; keep `defaults` only as a seed used when the API returns **zero** blocks | The file stops encoding *what the page says* and encodes only *how a block looks*. |
| `frontend/app/[locale]/about/page.tsx` | Body blocks render through `RichContent` (which re-sanitizes) | Same sanitize-on-render guarantee posts already have - stored HTML is never trusted at render time. |
| `frontend/app/[locale]/connect/page.tsx` | No change | Still reads `sections`. |

---

## End-to-end flow

```
Admin opens /admin/pages/about
        │  GET /api/v1/pages/about  → { sections, blocks[] }
        ▼
PageBlockEditor: + Add section / Remove / ↑↓ / lite rich-text editing
        │  PUT /api/v1/pages/about { blocks:[ {id?, block_type, title, content, props}, … ] }
        ▼
PageService.ReplacePageBlocks
        ├─ upsert payload rows, position = array index
        ├─ delete rows absent from payload + their translations + pending jobs
        └─ diff vs pre-fetch → enqueue {title, content} per CHANGED block only
                │
                ▼
        translation worker → translations(record_id = block uuid, field_name='title'|'content', locale='vi')
                │
                ▼
Visitor hits /vi/about → GET /pages/about?locale=vi
        └─ two COALESCE joins → Vietnamese where present, English where not
                │
                ▼
PageBlocks registry → typed component per block (unknown types skipped)
```

## Security callouts

- **No new auth surface.** `PUT /pages/:slug` is already inside the `RequireAdmin` group; the
  delete capability rides the same gate. Reads stay public, per the standing rule.
- **`block_type` is validated server-side** against an allow-list - a crafted payload cannot
  persist an unrenderable type.
- **Destructive-by-design endpoint.** `PUT` with `blocks` now *deletes* rows. Mitigations:
  a payload with `blocks: []` is rejected (400), removal requires an explicit confirm in the UI,
  and the delete is scoped to `page_slug` inside a transaction.
- **HTML is sanitized twice** - on save (`lib/pages.ts`) and on render (`RichContent`), reusing
  `sanitizeBody.ts` so page bodies get the identical treatment post bodies already get.
- `margin-left` joins the allow-listed styles; it is numeric-bounded in the extension and cannot
  carry a URL or expression.

## Scope estimate

| Phase | Est. |
|---|---|
| 1 - Migration + backfill + translation re-point | 1.5-2 h (the SQL merge is the fiddly part) |
| 2 - Backend TDD, repo/service/handler, docs | 2.5-3 h |
| 3 - Block builder + lite editor + indent extension | 3-4 h |
| 4 - Registry renderer + About rewrite | 1-1.5 h |

Roughly a full day. Phases 1-2 are independently shippable (the API grows, nothing breaks);
Phases 3-4 are what the admin actually sees.

## Decisions locked (2026-07-27)

1. **v1 block types: `hero`, `rich_text`, `quote`.** No `image` block yet - it is one registry
   entry + one renderer to add later, which is exactly the property the block model buys us.
   Dropping it keeps Phase 3 free of upload wiring inside the builder.
2. **`values_item_1..4` merge into a single `<ul>` block.** The 3 orphaned Vietnamese rows are
   deleted by the migration and one re-translation job is enqueued. Acceptable because those
   fields still hold `TODO:` placeholders, so no human-reviewed translation is lost.
3. **`/admin/pages` keeps its hardcoded `about` / `connect` list for now.** Making it
   DB-driven is a separate, smaller change once a third page actually exists - building it
   speculatively would add a page-registry table nothing needs yet.

---

## DB-backed page content (About & Connect) - Phase 2

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
1. `backend/internal/handler/pages_test.go` - mock service, test Get + Update
2. `backend/internal/model/types.go` - add PageContent struct + request type
3. `backend/internal/repository/pages.go` - GetSections, UpsertSections
4. `backend/internal/service/pages.go` - GetPageContent, UpdatePageContent
5. `backend/internal/handler/pages.go` - service interface, Get, Update handlers
6. `backend/cmd/server/main.go` - register routes

### Frontend files
7. `frontend/app/about/page.tsx` - fetch from API, fall back to defaults
8. `frontend/app/connect/page.tsx` - fetch from API, fall back to defaults
9. `frontend/app/admin/pages/[slug]/page.tsx` - admin editor form
10. `frontend/app/admin/page.tsx` - add "Edit Pages" links

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
- **Hover trigger**: `onMouseEnter`/`onMouseLeave` on a container `div` wrapping both the picker and the Like button - so moving the mouse from button to picker does not close it.
- **Picker animation**: Tailwind `transition-all duration-200` + `translate-y-2 opacity-0` → `translate-y-0 opacity-100`. Uses `pointer-events-none` when hidden.
- **Toggle off**: Clicking your own active reaction removes it (DELETE). Clicking a different emoji changes it (POST upsert).
- **Optimistic update**: Update `counts` and `myReaction` immediately; no loading state beyond a `pending` lock to prevent double-submit.
- **Reads**: Still go directly to Supabase anon client (no need to go through Go for reads).
- **Writes**: Go through Go backend (`POST /api/v1/reactions`, `DELETE /api/v1/reactions/:post_id`).

### Potential side effects

- `ReactionBar` no longer shows all four emojis by default - it shows a Like button + counts for emojis that have reactions. This is a UX change visible site-wide on PostCard.
- The `apiPostAnon` / `apiDeleteAnon` helpers bypass the auth header - only valid for public endpoints.
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

### Milestone 1 - shell-postcard (public reads)

Files to create/modify:
1. `frontend/lib/types.ts` - TS types matching database schema
2. `frontend/lib/supabase.ts` - Supabase anon client for public reads
3. `frontend/lib/api.ts` - Fetch wrapper for Go backend writes (stubbed, fleshed out in milestone 3)
4. `frontend/app/globals.css` - Church design tokens (Tailwind v4 CSS-first)
5. `frontend/next.config.ts` - Image remote patterns for Supabase Storage
6. `frontend/components/ui/Navbar.tsx` - Responsive nav with mobile menu
7. `frontend/components/features/posts/PostCard.tsx` - Facebook-style post card (server component)
8. `frontend/components/features/posts/PostFeed.tsx` - List of PostCards + empty state
9. `frontend/components/features/posts/ReactionBar.tsx` - Emoji display (client component)
10. `frontend/app/layout.tsx` - Root layout with Navbar + footer
11. `frontend/app/page.tsx` - Homepage: hero + latest announcements + upcoming events
12. `frontend/app/announcements/page.tsx` - Full announcement feed
13. `frontend/app/events/page.tsx` - Full events feed

### Milestone 2 - admin-layer (auth + admin chrome)

1. `frontend/lib/auth.ts` - Auth context/provider, session helpers, admin check
2. `frontend/components/features/admin/AdminControls.tsx` - Edit/delete overlays on PostCard
3. `frontend/app/admin/page.tsx` - Admin dashboard (login prompt + all posts)
4. Update Navbar with login/logout button
5. Update PostCard/PostFeed to accept `isAdmin` and show controls

### Milestone 3 - writes-api (create/edit/delete wiring)

1. Flesh out `frontend/lib/api.ts` with POST/PATCH/DELETE
2. `frontend/components/features/admin/AdminPostForm.tsx` - Create/edit form
3. `frontend/app/admin/[section]/page.tsx` - Section-specific create/edit page
4. Backend: implement PostService, PostHandler CRUD methods
5. Backend: wire routes + services + repos in main.go
6. Backend: unit tests for handler and service layers
