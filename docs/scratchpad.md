## Scratchpad (deprecated for new features - use progress.md)

We are consolidating design/progress tracking into `docs/progress.md`.

`docs/progress.md` now contains feature-level design decisions, architecture notes, metrics, and implementation diary entries.

Plans still stage here while they await approval; once shipped, the write-up moves to `progress.md`.

---

# AWAITING APPROVAL - Homepage revival

## The problem

The homepage fails PRODUCT.md's own anti-generic test: "Would a Vietnamese-American
evangelical community of 100 people who share life together recognize themselves in
this design, or could it belong to any organization on the internet?" Today it could
belong to anyone:

1. Hero says "Welcome to Our Church" - does not name the church, no Vietnamese, no
   service time, no address. Copy is template filler.
2. Three body sections share one identical shape (same heading size, same "View all",
   same card). Heading-to-card-title scale ratio is ~1.1x - visually flat, nothing
   dominates.
3. Zero photos of members despite a full gallery feature. `RecentMoments.tsx` exists
   as an empty file - this plan finally builds it.
4. PRODUCT.md's "date numerals on event cards: 22px Playfair 700" spec was never
   implemented - events show an emoji and small text.
5. Homepage strings are hardcoded English (no `getTranslations`) - the `/vi` homepage
   shows English chrome, undercutting the bilingual identity.
6. One 1.15s page fade is the only motion - no rhythm as you scroll.

## Decisions taken (user-confirmed 2026-08-05)

Structure/UX forks:
- Bilingual headings as visible texture on both locales (e.g. "Latest Announcements - Thong bao")
- Photo strip of recent gallery moments (build `RecentMoments`)
- Hero goes left-aligned asymmetric

UI identity forks (second round, same day):
- Arch as the site's one non-rectangle shape - RecentMoments photo frames only
- Closing dark band before the footer - the hearth bookend (amends "darkness lives
  in the hero band only" and the section-background hard-avoid; see Phase 7 doc edits)
- Paper grain on the cream field (~2.5% opacity; user chose this against my
  recommendation to skip - keep it a whisper, light mode only)

UI moves included without a fork (low-risk deployments of existing tokens):
- Ember rule (terracotta-to-gold gradient line) becomes a repeating motif: short
  version under section headers, full version on the closing band
- Section color voices: announcements = terracotta, events = sage, gallery = gold,
  as non-interactive tick/rule accents only; links stay terracotta everywhere so
  the One Ember Rule survives
- EventRow date block sits on a primary/10 wash - terracotta at structural scale
- Emoji icons (the 📅) removed from homepage surfaces

## What does NOT change

- Palette, fonts, tokens - the system is good; the page just doesn't use its range
- Backend, database, API - zero server changes; photo strip reuses `listPosts({type:'gallery_album'})`
- PostCard itself (just landed the card-lift work; announcements keep it)
- Other pages - homepage only

## Phase 1 - i18n foundation + real words

Everything else flows through this: no copy can be written twice.

| File | Change | Why |
|---|---|---|
| `frontend/messages/en.json` | New `home` namespace: hero eyebrow, display line, description, service line, CTA labels, section headings (en + vi pair per heading), photo-strip heading, empty states | Single source for all homepage copy; kills the hardcoded strings |
| `frontend/messages/vi.json` | Same keys, Southern Vietnamese register | `/vi` homepage finally renders Vietnamese |
| `frontend/app/[locale]/page.tsx` | `getTranslations('home')`, replace every literal string | The `/vi` bug fix; enables every later phase |

**Copy draft (needs owner review, especially Vietnamese):**
- Eyebrow: `VGOMNE - Saugus, MA` (also fixes the missing space in "Ministry· Saugus")
- Display: `Mot gia dinh, one family in Christ.` - the Vietnamese phrase carries the
  one italic terracotta moment (PRODUCT: one italic phrase per page)
- Description: names who we actually are - Vietnamese-American church family,
  two languages, one congregation
- Service line: `Sundays [TIME] - [ADDRESS], Saugus, MA` - **placeholders: real
  service time and street address must come from the owner. Do not invent.**

## Phase 2 - Hero: asymmetric, identified, useful

| File | Change | Why |
|---|---|---|
| `frontend/app/[locale]/page.tsx` | Hero content block: left-aligned in the content column (`text-center` and centered stack go); radial glow stays right so text and glow balance asymmetrically; add service-time line under description in `#f5f0eb/70` with a thin gold rule accent | PRODUCT demands "intentional asymmetry over centering everything"; the service line answers the 3-second "when/where" question |
| same | Display line becomes the bilingual sentence; keep `clamp(2.25rem,5.5vw,4rem)` Playfair 700 | Identity does the work; hero stays type-only per PRODUCT unless admin uploads video |

Video/glow/bottom-rule mechanics untouched - `HeroVideo` unchanged.

## Phase 3 - Section rhythm: one shape per section

| File | Change | Why |
|---|---|---|
| `frontend/components/ui/SectionHeader.tsx` (new) | Shared header: Playfair `text-3xl sm:text-4xl` English + muted Vietnamese echo + optional "View all" link + short (~40px) ember rule beneath, tinted by an `accent` prop (`terracotta \| sage \| gold`) | Reusable-components-first; ~2x scale jump so sections dominate their cards; the hero's signature line becomes a repeating motif; each section gets a color voice without touching link colors |
| `frontend/components/features/posts/EventRow.tsx` (new) | Compact row for homepage Upcoming: left date block (day numeral 22px+ Playfair 700 in terracotta on a `bg-primary/10` rounded block, month label above), title, location line; whole row links to the event; `card-lift`; no emoji | Implements the dead PRODUCT date-numeral spec; terracotta finally appears at structural scale instead of chip scale; Upcoming stops looking identical to Announcements |
| `frontend/app/[locale]/page.tsx` | Use `SectionHeader` x3 (announcements=terracotta, events=sage, gallery=gold); Upcoming renders `EventRow` list instead of `PostFeed` | The rhythm change itself |

Announcements keep full `PostCard` (content to read); events are appointments to
scan - different jobs, now different shapes.

## Phase 4 - RecentMoments photo strip

| File | Change | Why |
|---|---|---|
| `frontend/components/features/gallery/RecentMoments.tsx` (build the empty file) | Server component: takes gallery-album posts, flattens to newest 6-8 images, horizontal snap-scroll strip of **arch-topped frames** (`rounded-t-full` over the 14px base radius; varied widths for rhythm; `card-lift`), links to `/gallery`. Renders nothing when no albums | Real faces are the strongest "stay and browse" pull this site has; the arch is the site's single non-rectangle shape - church + Vietnamese doorway resonance, used only here so it stays special |
| `frontend/app/[locale]/page.tsx` | Fetch `listPosts({type:'gallery_album', limit:3, locale})` in the existing `Promise.allSettled`; render strip between Upcoming and Past with `SectionHeader` | Failure-isolated like the other feeds; future-facing content stays above nostalgia |

## Phase 5 - The hearth bookend + texture

| File | Change | Why |
|---|---|---|
| `frontend/app/[locale]/page.tsx` | Closing full-bleed band after Past Events: `#1C1210`, soft radial glow (mirrored left, so hero and bookend frame the page), bilingual line "Ghe tham chung toi - Come sit with us.", service time + address, one CTA to `/connect`, full-width ember rule at its top edge | The hearth appears twice - you leave the way you arrived. Dark - cream - dark gives the scroll a shape instead of trailing off |
| `frontend/app/globals.css` | Paper grain: inline SVG `feTurbulence` data-URI on a `body::before` fixed overlay, ~2.5% opacity, `pointer-events-none`; **light mode only** (grain on `#141210` reads as dead pixels, so dark mode stays clean); no effect on text contrast at this opacity | "Warm Paper" becomes literal material instead of a hex code |

## Phase 6 - Motion: staggered entrance

| File | Change | Why |
|---|---|---|
| `frontend/app/globals.css` | `.stagger-children` utility: children run the existing `page-fade-in` keyframe with `animation-delay` stepped ~70ms via nth-child (cap ~8); disabled under `prefers-reduced-motion` | Cards arrive as a sequence, not a wall; reuses existing keyframe and ease - no new motion vocabulary |
| `frontend/app/[locale]/page.tsx` | Apply to feed containers | The "alive" feeling on first paint |

## Phase 7 - Docs (same commit)

| File | Change |
|---|---|
| `docs/components.md` | `SectionHeader`, `EventRow`, `RecentMoments` entries; homepage data-flow note |
| `docs/agents/frontend.md` | Folder list + i18n note: homepage copy lives in `messages/*.json` `home` namespace |
| `PRODUCT.md` | Amend two Hard Avoids with user approval: gradients line gains "the ember rule motif may repeat (section headers, closing band)"; section-background line gains an explicit carve-out for the two dark hearth moments (hero + closing band). Add grain as sanctioned texture so a future agent doesn't strip it |
| `DESIGN.md` | "Darkness lives in the hero band only" becomes "hero and closing band - the hearth bookends"; section color voices rule; arch = the one non-rectangle shape, RecentMoments only; section-header scale; date-numeral spec marked implemented |
| `docs/progress.md` | Entry for the redesign |

Note: `DESIGN.json` intentionally NOT hand-edited this time - it goes stale until
the owner decides between deleting it or regenerating via `/impeccable document`
(open question from the sidecar discussion).

## End-to-end flow

```
messages/en.json + vi.json (home namespace)
        v
page.tsx (getTranslations + Promise.allSettled: announcements, events, albums, hero video)
        v
Hero (asymmetric, bilingual display, service line)
        v
SectionHeader [terracotta] -> PostFeed (announcements, PostCards, staggered)
SectionHeader [sage]       -> EventRow list (upcoming, date numerals)
SectionHeader [gold]       -> RecentMoments (arch frames -> /gallery)
SectionHeader [terracotta] -> PastEventsCarousel (unchanged)
        v
Hearth bookend (dark band: come sit with us -> /connect)
```

## Security callouts

None. All reads are public endpoints already in use; no new API surface, no auth
changes. Photo strip shows only images admins already published to the gallery.

## Scope estimate

| Phase | Size |
|---|---|
| 1 - i18n + copy | ~1h (Vietnamese copy review is the long pole) |
| 2 - Hero | ~45min |
| 3 - SectionHeader + EventRow (+ ember rule, color voices) | ~2h |
| 4 - RecentMoments (arch frames) | ~1.25h |
| 5 - Hearth bookend + grain | ~1h |
| 6 - Stagger | ~30min |
| 7 - Docs | ~45min |

## Open items for the owner

1. Real service time + street address (Phase 1 placeholder - will not invent)
2. Vietnamese copy review - drafts will be Southern register per church identity
3. Verify locale behavior in a PROD build (known dev-server locale quirk)

---

# SHIPPED - Calendar places: AI-named, address-keyed, deduped

**Status:** implemented 2026-08-01 across six commits, one per phase. Migration `000014` applied and
verified on the local dev DB (up / down / up with all events intact, `ON DELETE SET NULL` confirmed
against real rows). Backend `go build` / `go vet` / `go test ./...` green; frontend `tsc --noEmit`
clean, `npm run build` succeeds, `test:color` 8/8, `test:places` 12/12.

**The shipped write-up lives in `docs/progress.md` (2026-08-01)** - read that first. The plan below is
kept as the design record.

**Deviations from the plan:**
- The "same place as X" hint on address blur (Phase 5) was **dropped**. Implementing it would have
  required the frontend to decide whether two addresses are the same place, which is exactly the
  Go/TypeScript drift the rest of the design avoids. The suggestion dropdown covers the need.
- Docs were written per-phase rather than saved for a final Phase 6, so Phase 6 reduced to this
  status block plus the `progress.md` entry.
- Two bugs surfaced during phase verification that the plan did not anticipate: the street-type
  fallthrough on a bare address (Phase 2) and zero-valued timestamps on a joined place (Phase 4).
  Both are recorded in `progress.md`.

Supersedes an earlier draft of this plan that stored a hand-typed `place_name` on each event - see
"Why this shape" below.

## The problem

`CalendarShell`'s Locations strip maps 1:1 over every event carrying an address and prints
`{day} {title} - {address}`. It is an event list wearing a "Locations" heading, and since the strip
is not marked `data-export-hide`, that repetition prints into the PNG shared to Discord.

The paper calendar the congregation already knows does it correctly. May's footer reads:

```
Youth Camp Address: 1414 Plank Road, Hooversville, PA 15936
Church Address:     101 Main St, Saugus, MA 01906

Friday Bible Study:
Chris & Sebs - 39 Bridle Ridge Dr, North Grafton, MA 01536
MST House    - 203 Essex Street, Saugus MA 01906
```

Four places for eleven address-bearing events. `Church Clean up/renovation` (May 8, 9),
`Church Service 10am` (May 10, 24), `Saturday BBS Church 7pm` (May 16, 30) and
`Church renovation` (May 24-25) all collapse into one line: **Church**.

## Why this shape

Two facts drive the whole design.

**1. A place name is a function of its address.** Two different places cannot share an address, so
`101 Main St` is "Church" regardless of which event mentions it. That makes the name a property of
the *address*, not of the event - which means it belongs in a table keyed by address, and dedupe
becomes structural rather than a string comparison performed at render time.

**2. That function only has to be computed once per address, ever.** The LLM is asked "what is this
place called?" the first time an address appears. Every later event at that address reuses the
stored answer: no API call, and no chance of the same building being named "Church" one month and
"Church Renovation" the next.

This is why the earlier draft was wrong. It hung a `place_name` on each event, which would have
asked the model the same question repeatedly and let the answers disagree.

## What the model is actually asked to do

Given an event title and an address, return the place label a church bulletin would print:

| Event title | Address | → Place |
|---|---|---|
| `Friday BBS Chris & Sebs` | 39 Bridle Ridge Dr, North Grafton | `Chris & Sebs` |
| `Saturday BBS Church 7pm` | 101 Main St, Saugus | `Church` |
| `Church Clean up/renovation` | 101 Main St, Saugus | `Church` |
| `Friday BBS MST's House` | 203 Essex Street, Saugus | `MST House` |
| `Youth Camp` | 1414 Plank Road, Hooversville | `Youth Camp` |

The judgment being bought: strip the weekday, the time, and the activity (`BBS`, `Bible Study`,
`meeting`, `clean up`, `renovation`, `service`) - keep the venue or host. Sometimes the activity
word *is* the venue (`Church`), sometimes the event name *is* the destination (`Youth Camp`).
That distinction is why this is a model call and not a regex.

---

## Phase 1 - Database

| File | Change | Why |
|---|---|---|
| `backend/migrations/000014_calendar_places.up.sql` | New table `calendar_places (id uuid pk, address_key text not null unique, address text not null, name text not null, name_source text not null default 'ai', created_at, updated_at)` | `address_key` (the normalized address) carries the `unique` constraint, so "same place" is enforced by Postgres instead of re-derived on every render. `address` keeps the human formatting for display; `name_source` distinguishes an AI guess from an admin's correction so a later re-derive can never overwrite a human. |
| same file | `alter table calendar_events add column place_id uuid references calendar_places(id) on delete set null;` + index | Resolved once at write time. `on delete set null` rather than cascade - deleting a place must never delete events. |
| same file | `insert into system_prompts (key, content, version) values ('place_name', ...) on conflict do nothing` | Puts the prompt in the same table as `vi_translation`/`en_translation`, which means it is editable in Supabase and picked up within the 5-minute `PromptCache` TTL - prompt tuning with no redeploy. `on conflict do nothing` matches the 000004/000013 seeds so a re-run never clobbers an edited copy. |
| `backend/migrations/000014_calendar_places.down.sql` | Drop the column, the table, and the prompt row | Migrations auto-apply on boot; the round trip gets tested in a rolled-back transaction before this goes near prod, same as 000012. |
| `docs/agents/database.md` | New table section + `place_id` on the `calendar_events` DDL + migration list | That doc is what the next agent reads instead of the DB. |

No backfill. Existing events keep `place_id = null` and render address-only until they are next
saved, so nothing breaks on deploy.

## Phase 2 - Address normalization (pure, tested first)

| File | Change | Why |
|---|---|---|
| `backend/internal/model/address_test.go` | Written **first**. Cases: exact, case, whitespace/newlines, punctuation, `St`/`Street`, `Ave`/`Avenue`, `Rd`/`Road`, `MA`/`Massachusetts`, diacritics, and the negative cases - two genuinely different addresses must **not** collapse | TDD rule. The abbreviation table is exactly the thing that quietly over-matches; the negative cases are the real value. |
| `backend/internal/model/address.go` | `NormalizeAddressKey(raw string) string` - lowercase, fold diacritics, strip punctuation, collapse whitespace, expand street-type and state abbreviations | Server-side rather than in TypeScript because resolution happens at **write** time. One implementation, no Go/TS pair that can drift. It reuses the diacritic-folding approach already in `model.SlugifyEventType`. |

## Phase 3 - Place resolution + the model call

| File | Change | Why |
|---|---|---|
| `backend/internal/repository/calendar.go` | `GetPlaceByKey`, `UpsertPlace`, `UpdatePlaceName`, `ListPlaces`; add `place_id` to the 4 SELECT/RETURNING column lists and their `rows.Scan` targets, plus `InsertEvent`/`UpdateEvent` | The 4 scan sites are the real risk in this phase - a missed one is a runtime scan error, not a compile error. |
| `backend/internal/service/calendar.go` | `resolvePlace(ctx, address, title)`: normalize → look up by key → **hit: attach `place_id`, no model call** → miss: insert with the event title as a provisional name, attach, then fire the naming goroutine | The cache-hit path is the whole point: one model call per address for the life of the church. The provisional name means the strip is never blank even if the call never lands. |
| `backend/internal/service/place_namer.go` **(new)** | `deriveName` loads the `place_name` prompt via the existing `PromptCache`, calls Gemini through the translator's `callGemini`, validates, and writes the result **only when `name_source = 'ai'`** | Reuses the engine that already exists rather than adding a second AI client. The `name_source` guard is what makes an admin rename permanent. |
| same file | Validation before persisting: trim, collapse to one line, reject empty, cap at 40 chars, fall back to the provisional name on any failure | The model's output goes straight onto a public page and into the exported image. A bad or empty answer must degrade to the event title, never to a blank row or a paragraph. |
| `backend/internal/service/calendar.go` | The naming call is **fire-and-forget** (`go func()` + `context.Background()`), exactly like `captureFinetuningExample` in `service/translation.go` | Saving an event must not wait on Gemini, and a Gemini outage must not fail a save. Known trade-off: a crash between insert and naming leaves the provisional name, which the admin can fix with the Phase 5 rename. A durable queue is deliberately not worth it for one call per new address. |
| `backend/internal/service/calendar_test.go` | Cases: second event at a known address makes **zero** model calls; a failed call leaves the provisional name; `name_source='admin'` is never overwritten | These three are the behaviours that cost money or lose an admin's work if they regress. |

### The `place_name` system prompt (seeded in Phase 1, editable in Supabase after)

```
You name PLACES for a Vietnamese-American church calendar's locations list.
The church building is 101 Main St, Saugus, MA 01906 - always call it "Church".

Given an event title and its street address, reply with ONLY the short name of the place,
the way a church bulletin would label it.

- Drop weekdays, times, and activity words (BBS, Bible Study, meeting, clean up,
  renovation, service, camp registration).
- Keep the venue or the host: "Friday BBS Chris & Sebs" -> "Chris & Sebs"
- When the event happens at the church building, answer "Church".
- When the event name IS the destination, keep it: "Youth Camp" -> "Youth Camp"
- Answer in the same language the title is written in.
- 1 to 4 words. No address, no trailing punctuation, no explanation.
```

The existing place names are passed as context on each call so a new place is named consistently
with the vocabulary already in use.

## Phase 4 - API + display

| File | Change | Why |
|---|---|---|
| `backend/internal/model/types.go` | `CalendarEvent.Place *CalendarPlace \`json:"place,omitempty"\`` carrying `{id, name, address}` | One nested object rather than loose fields - it travels and gets stripped as a unit. |
| `backend/internal/handler/calendar.go` | In the existing non-admin strip block, `resp.Events[i].Place = nil` whenever `!AddressPublic`, alongside `PrivateAddress` | One boundary to audit. "MST House" identifies a family as much as their street number does, so name and address are hidden together. |
| `frontend/components/features/calendar/types.ts` | `CalendarPlace` + `place` on `CalendarEvent` | Mirrors the Go model. |
| `frontend/components/features/calendar/CalendarShell.tsx` | Replace the `eventsWithAddress.map` block with a group-by-`place.id` pass, rendering `dot + Name: address` - no day, no event title | Dedupe is now a group-by on a FK, not string matching. The strip finally lists what its heading claims. |
| `frontend/components/features/calendar/CalendarShell.tsx` | Row is click-to-edit when the place maps to exactly one event; otherwise not clickable, with an admin-only `×3` badge marked `data-export-hide` | Dropping the day removes the unambiguous click target. The count says why the row went quiet and how many events sit behind it, and stays out of the exported image. |

## Phase 5 - Admin control

| File | Change | Why |
|---|---|---|
| `backend/cmd/server/main.go` | `GET /calendar/places` and `PATCH /calendar/places/{id}` **inside** the `RequireAdmin` group | Unlike `/event-types` and `/palette` (deliberately public lists of labels and hex codes), these expose addresses regardless of `address_public`. The route comment will say so. |
| `frontend/components/features/calendar/EventModal.tsx` | Under the address, show the resolved place name in an editable "Shown in Locations as" field, with a "renames this place everywhere" note; saving it sets `name_source='admin'` | The model will occasionally be wrong, and the fix has to be one edit in an obvious place - not eleven event edits. This is also the escape hatch that makes shipping an AI guess safe. |
| `frontend/components/features/calendar/EventModal.tsx` | Typing an address that resolves to a known place shows an inline "Same place as **Church**" hint before saving | The "auto recognize" half made visible: the admin sees the dedupe happen rather than discovering it later in the footer. |

## Phase 6 - Docs (same commit, per AGENTS.md)

`docs/api.md` (places endpoints + the `place` object) · `docs/agents/backend.md` (route table,
admin-only rationale, a "Place naming" section next to "Translation engine") ·
`docs/agents/database.md` (Phase 1) · `docs/agents/frontend.md` · `docs/components.md` ·
`docs/progress.md` (the shipped write-up)

---

## End-to-end flow

```
admin saves "Saturday BBS Church 7pm" with address "101 Main St, Saugus MA"
   │
   ▼  service.resolvePlace
NormalizeAddressKey  ->  "101 main street saugus massachusetts"
   │
   ├── HIT  in calendar_places  ->  place_id attached.  NO model call.      ← the common path
   │
   └── MISS ->  insert { address_key, address, name: "Saturday BBS Church 7pm", name_source:'ai' }
                attach place_id, return to the admin immediately
                   │
                   └── go func():  system_prompts['place_name'] -> Gemini 2.5 Flash
                                   -> "Church" -> validate -> update name (only if still 'ai')
   ▼
GET /calendar  ->  event.place = { name:"Church", address:"101 Main St, Saugus MA" }
                   stripped entirely for non-admins when address_public = false
   ▼
Locations strip groups by place.id  ->  one row:  ● Church: 101 Main St, Saugus MA
   ▼
same row in the PNG export shared to Discord
```

## Security callouts

- `GET /calendar/places` and `PATCH /calendar/places/{id}` are **admin-only** - the one pair of
  calendar reads/writes that touches addresses regardless of `address_public`, which is why they do
  not join the public group.
- `place.name` is stripped with `private_address` in the same non-admin block, gated on the same
  flag. A place name can identify a household as precisely as a street number.
- Model output is never trusted raw: trimmed, single-lined, length-capped, and falls back to the
  event title. It reaches a public page, so an unvalidated answer is a content-injection surface.
- The FK is `on delete set null`; deleting a place cannot delete events.
- Export behaviour unchanged: still prints every address, public or not.

## Cost

One Gemini 2.5 Flash call per address that has never been seen, with a ~100-token prompt and a
~5-token answer. A congregation with a handful of venues will make single-digit calls per year.
Every repeat is a primary-key lookup. If `GEMINI_API_KEY` is unset the naming goroutine no-ops and
places keep their provisional names - same opt-in degradation as the translation worker.

## Out of scope (flagged, not done)

- **Translating place names.** `place.name` is not enqueued for translation, matching how
  `private_address` is already treated. It displays as the model wrote it, in the language of the
  title that created it.
- **The "Friday Bible Study:" grouping header** in the paper calendar's footer. That is a second
  level of structure (a category above places), and the flat deduped list is the prerequisite.
- **Backfilling existing events.** They stay `place_id = null` and render address-only until saved.
- **Merging two places that turn out to be one** (typo'd address saved before the fix). The rename
  covers the name; merging rows needs its own admin action.

## Scope estimate

| Phase | Estimate |
|---|---|
| 1 - Database | ~30 min (table + column + prompt seed; the down/up round trip is the real work) |
| 2 - Normalization | ~45 min (tests first) |
| 3 - Resolution + model call | ~2 h (the cache-hit path and the validation are the careful parts) |
| 4 - API + display | ~1.5 h |
| 5 - Admin control | ~1 h |
| 6 - Docs | ~45 min |

Verification before calling it done: `go build ./... && go vet ./... && go test ./...`,
`npx tsc --noEmit`, `npm run build`, `npm run test:color`, plus a manual pass creating
`Saturday BBS Church 7pm` and `Church Clean up/renovation` at the same address typed two different
ways, confirming one model call, one row in the strip, and one entry in the export.

---

# SHIPPED - Flexible calendar event types, colors, and "no icon"

**Status:** implemented 2026-07-28. Migration `000012` applied and verified on the local dev DB
(20 events before / 20 after, all four distinct type counts identical; down-then-up round trip
tested inside a rolled-back transaction). Backend `go build` / `go vet` / `go test ./...` green,
frontend `tsc --noEmit` clean, `npm run build` succeeds, `npm run test:color` 8/8.

**Deviation from the plan below:** the plan proposed handler-level tests. The calendar handler
depends on the concrete `*service.CalendarService` rather than an interface, so there is no seam to
mock without refactoring the existing handler - out of scope for this change. Coverage instead sits
at the model layer (`internal/model/calendar_types_test.go`: slugify, color/icon/slug validation)
and in `frontend/lib/__tests__/color.test.ts`, which is where the actual logic and the actual
security boundary live. The route wiring was verified by live smoke test instead.

## The problem

The event modal ([`frontend/components/features/calendar/EventModal.tsx`](../frontend/components/features/calendar/EventModal.tsx))
gives admins three pickers, and all three are **closed sets** an admin can never grow:

| Picker | Where the set is frozen | Consequence |
|---|---|---|
| Type | `calendar_event_type` **Postgres enum** + a `switch` in `model/types.go` + `EVENT_TYPE_LABELS` in `types.ts` | "Baptism", "Fellowship Meal", "Church Anniversary" all require a migration + a backend deploy + a frontend deploy |
| Color | `AllowedCalendarColors` map (9 keys) + `COLOR_MAP` (9 keys) | The church's own Christmas red or the printed calendar's exact purple is unreachable |
| Icon | `AllowedCalendarIcons` map (11 keys), no empty option | Every event is forced to wear an icon, even when the title alone reads better |

Adding a fourth category next Easter should be a thing an admin does in ten seconds, not a thing
the developer ships.

---

## Research - how the industry solves this

### Custom colors

| Product | Design | What we steal |
|---|---|---|
| **Google Calendar** (custom event colors, June 2026) | 24 preset swatches in a grid; a full RGB/hex picker reachable from the same popover. The custom color is stored **on the event**, not as a named entity, and syncs to mobile. | Presets and custom live in **one** picker, not two screens. Hex belongs on the event. |
| **GoodNotes 6** | Preset swatch grid + a **`+` that opens a Custom tab** (color wheel, hex field, eyedropper). Tapping `+` / "Add to Presets" **writes the color back into the swatch grid permanently**. An "Edit" affordance removes a saved swatch. Swatches are unnamed. | **This is the chosen model.** The `+` both applies the color *and* grows the shared palette, so the second admin who wants that red just clicks it. No naming ceremony. |
| **GitHub labels** | Preset swatch row + hex text field + randomize, with a **live preview chip**. Solid color only - no alpha, because the text on top must stay readable. | Live preview before commit; no alpha. |
| **Outlook categories** | Fixed 25 colors, each **named** and renamable | Rejected - naming every swatch is ceremony a church admin will not maintain. |

The non-obvious part every one of these solves: a custom hex is **not one value**. A chip needs a
fill tint *and* a readable text color on top of it; a banner needs a dark fill with white text. So a
custom hex has to be expanded into a ramp, with a WCAG 4.5:1 check on the derived text color -
HSL lightness manipulation is the standard technique.

### Adding a type / category

| Product | Design | What we steal |
|---|---|---|
| **Airtable** single-select | `+ Add option` inline; each option is a row with a name + a `⌄` color dropdown; options are **global and reusable**, never per-record | Global reusability. One admin's "Baptism" is every admin's "Baptism". |
| **Linear / Notion / shadcn combobox** | Type a name that doesn't exist → a `+ Create "Baptism"` row appears inline. The option is created as a real reusable entity **without leaving the form**. | The creation flow. No settings screen, no context switch. |
| **Jira issue types** | Separate admin settings screen, name + description + icon | Rejected - too heavy for a 100-member church with a handful of admins. |

The consensus is **create-on-the-fly, stored globally**: the convenience of ad-hoc typing with the
consistency of a managed vocabulary. Per-event free text is what everyone moved *away* from,
because it fragments ("Baptism" / "baptism" / "Baptism Service") and breaks legends and filters.

### No icon

| Product | Design |
|---|---|
| **Notion** | Click the icon → `Remove`. Added for callouts specifically because a forced icon made blocks noisy. |
| **Slack status** | An `X` to clear the emoji |
| **Asana / Figma variants** | A `None` tile inside the grid |

The picker-grid convention is a **first tile with a dashed border and a slash glyph**, labeled
"None" - because inside a radio group "no icon" is a *selectable state*, not an action. A
"Remove" button next to the grid would be a different control with different keyboard semantics.

---

## Decisions locked (2026-07-28)

1. **Types are global and reusable**, created inline from the event modal. Enum → text + lookup table.
2. **Colors follow the GoodNotes model**: built-in swatches + a shared, persisted custom palette that
   the `+` grows. The event stores the resolved value (palette key *or* hex), so rendering never joins.
3. **Add only** for types - no rename/recolor/delete in v1. The palette *does* get a delete, because
   GoodNotes' "Edit → Remove Color" is part of the model being copied and it costs ~15 lines.

---

## Phase 1 - Database

New migration `backend/migrations/000012_calendar_flexible_types_and_palette.{up,down}.sql`.

| File | Change | Why |
|---|---|---|
| `000012_..._.up.sql` | `CREATE TABLE calendar_event_types (slug text PK, label text, default_icon text, default_color text, is_builtin bool, sort_order int, admin_id uuid, created_at, updated_at)`, seeded with the 6 built-ins and the exact icon/color defaults currently hardcoded in `EventModal.handleTypeChange` | The type vocabulary stops being a compile-time constant. `default_icon`/`default_color` move the smart-defaults map out of the component and into data, so a new type carries its own look. `is_builtin` protects the 6 the code branches on. |
| `000012_..._.up.sql` | `ALTER TABLE calendar_events ALTER COLUMN event_type DROP DEFAULT, TYPE text USING event_type::text, SET DEFAULT 'general'` then add FK → `calendar_event_types(slug)` `ON UPDATE CASCADE ON DELETE RESTRICT` | The enum is the actual blocker - Postgres enums can only be extended by migration. Text + FK keeps referential integrity (no orphan type on an event) while letting `INSERT` create new values at runtime. Seed must run **before** the FK is added. |
| `000012_..._.up.sql` | `CREATE TABLE calendar_palette_colors (id uuid PK, hex text UNIQUE CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'), sort_order int, admin_id uuid, created_at)` | The GoodNotes shared swatch grid. `UNIQUE` makes "add to palette" idempotent; the `CHECK` is the DB-level backstop against anything but a 6-digit hex reaching an inline `style`. |
| `000012_..._.down.sql` | Drop FK, drop palette table, map any non-builtin `event_type` back to `'general'`, convert the column back to `calendar_event_type`, drop the types table | The enum type itself is left in place by the up migration precisely so the down migration has something to cast back to. |

## Phase 2 - Backend

| File | Change | Why |
|---|---|---|
| `internal/model/calendar_test.go` | **First.** Tests for: `Slugify` ("Fellowship Meal" → `fellowship_meal`, accents/punctuation stripped, collision suffix), `IsAllowedCalendarColor` (named key ✓, `#7C3A6E` ✓, `red; background:url()` ✗, `#GGG` ✗), icon `"none"` accepted, event-type shape rejects `../admin` | TDD rule. These validators are the entire security surface of the feature - a bad hex reaches an inline `style` attribute, a bad slug reaches a URL and a FK. |
| `internal/model/types.go` | Add `"none": true` to `AllowedCalendarIcons`. Replace the `AllowedCalendarColors` map lookup with `IsAllowedCalendarColor(s string) bool` = named key **or** `hexColorRegexp` (already declared at line 13). Replace the closed `switch` on `EventType` in both validators with a shape check `^[a-z0-9_]{1,40}$`. | Existence of the type is a *database* question now, so the model can only check shape; the service checks existence. Reusing the existing `hexColorRegexp` keeps one definition of "what a hex is". |
| `internal/model/types.go` | New types: `CalendarEventTypeDef`, `PaletteColor`, `CreateEventTypeRequest{Label, DefaultIcon, DefaultColor}`, `CreatePaletteColorRequest{Hex}`, each with `Validate()` | Step 2 of the feature workflow - declare the data shape before any logic. |
| `internal/repository/calendar.go` | Add `ListEventTypes`, `CreateEventType`, `EventTypeExists`, `ListPaletteColors`, `CreatePaletteColor`, `DeletePaletteColor` | Raw SQL only, per the layer contract. |
| `internal/repository/calendar.go:198` | `COALESCE($5::calendar_event_type, event_type)` → `COALESCE($5::text, event_type)` | **Easy to miss and it breaks every event update.** The explicit cast names a type that no longer applies to the column. |
| `internal/service/calendar.go` | Validate `event_type` exists via `EventTypeExists` before create/update; on `CreateEventType`, slugify the label and return the existing row on slug collision instead of erroring | Business rule, so it belongs here per the global rules. Collision-returns-existing makes the inline "create" idempotent - two admins typing "Baptism" the same week get one type, not an error toast. |
| `internal/handler/calendar.go` | `ListEventTypes`, `CreateEventType`, `ListPaletteColors`, `CreatePaletteColor`, `DeletePaletteColor` - parse, validate, call service, write JSON | Three responsibilities only. |
| `cmd/server/main.go` | `GET /calendar/event-types` and `GET /calendar/palette` public; `POST /calendar/event-types`, `POST /calendar/palette`, `DELETE /calendar/palette/{id}` inside the `RequireAdmin` group | Matches the existing calendar posture (public reads intentional, writes gated) documented at `main.go:414-427`. |

## Phase 3 - Frontend form

| File | Change | Why |
|---|---|---|
| `frontend/lib/color.ts` **(new)** | `hexToHsl`, `hslToHex`, `contrastRatio`, `deriveRamp(hex) → {dot,text,bg,highlight}`. `text` starts at L=35% and steps down until it clears 4.5:1 against **both** white and the derived `highlight`, floored at L=12%. | The research finding made concrete. `EventBanner` fills with `ramp.text` and writes **white** on it; `EventChip` fills with `ramp.highlight` and writes `ramp.text` on it. Both contrast pairs must hold or a custom color produces unreadable chips. |
| `frontend/lib/__tests__/color.test.ts` **(new)** | Assert the ramp clears 4.5:1 on both pairs across a sweep of hues, including the hard ones (yellow `#FFD400`, pale `#E8E8E8`) | TDD rule, and yellows are exactly where naive lightness math fails. |
| `frontend/components/features/calendar/types.ts` | `CalendarEventType` union → `string`. Add `CalendarEventTypeDef`, `PaletteColor`. Add `resolveColor(color) → ramp` = `COLOR_MAP[color] ?? (isHex(color) ? deriveRamp(color) : COLOR_MAP.slate)`. `ICON_LABELS` gains `none: 'No icon'`. `EVENT_TYPE_LABELS` kept as the pre-fetch fallback. | One resolver means every consumer keeps its existing `{dot,text,bg,highlight}` contract and gains hex support for free. Keeping `EVENT_TYPE_LABELS` avoids a label flash before the fetch lands. |
| `frontend/lib/calendar.ts` | `getEventTypes`, `createEventType`, `getPaletteColors`, `createPaletteColor`, `deletePaletteColor` | The `apiGet`/`apiPost` layer, per the workflow rule against calling Supabase directly. |
| `frontend/components/features/calendar/CalendarIcon.tsx` | Return `null` when `iconKey === 'none'` | One guard at the source, so no caller has to know about the sentinel. |
| `EventModal.tsx` - Type field | Fetch defs on mount; render a chip per def; append a `+ Add` chip that swaps into an inline text input; Enter creates via the API, selects it, and appends the chip. `handleTypeChange` reads `default_icon`/`default_color` from the def instead of the hardcoded map at lines 101-108. | The Linear/Airtable creatable pattern. Deleting the hardcoded defaults map is the point - the data now carries the look. |
| `EventModal.tsx` - Icon field | Prepend a "None" tile: dashed border, `Prohibit` glyph, same 36px square, participates in the same selection state | The Notion/Asana convention, as a selectable state rather than a separate clear button. |
| `EventModal.tsx` - Color field | Built-in swatches, then saved palette swatches, then a `+` tile opening a small popover: native `<input type="color">`, hex text field, **live preview chip** rendering the derived ramp, and "Add to palette". Long-press / hover-`X` removes a saved swatch. | The GoodNotes flow end to end. The live preview is the GitHub detail that stops an admin from saving a color that turns out unreadable. |

## Phase 4 - Display

| File | Change | Why |
|---|---|---|
| `EventChip.tsx`, `EventBanner.tsx`, `DayEventsModal.tsx`, `CalendarShell.tsx` | Replace all six `COLOR_MAP[x] ?? COLOR_MAP.<fallback>` lookups with `resolveColor(x)` | Custom hex renders identically in the grid, the multi-day ribbon, the day modal, and the birthday/bible-study/address sidebar strips. Miss one and a custom color silently falls back to slate there. |
| `EventChip.tsx` | Skip the `<CalendarIcon>` element and its gap when `icon === 'none'` | `CalendarIcon` returning null would otherwise leave the flex gap, so the text sits off-centre. |
| `DayEventsModal.tsx:119` | Look the label up from the fetched defs, falling back to `EVENT_TYPE_LABELS[t] ?? t` | A custom type must not render as the raw slug `fellowship_meal`. |
| PNG export | **No change needed.** | `exportCalendarToPng` runs `html-to-image` over the live DOM, so anything that renders on screen is already in the export. Verified at `ExportButton.tsx:47`. |
| `docs/api.md`, `docs/components.md`, `docs/agents/backend.md`, `docs/agents/frontend.md`, `docs/agents/database.md` | New endpoints, models, table, and the changed `EventModal` props/data-flow | API + component documentation rules, same commit. |

## End-to-end flow

```
Admin opens New Event
   │
   ├─ GET /calendar/event-types  ──→ chips: Birthday … Graduation, [+ Add]
   └─ GET /calendar/palette      ──→ swatches: 9 built-ins + saved customs, [+]
   │
   ├─ types "Baptism" in the + chip, Enter
   │     └─ POST /calendar/event-types {label:"Baptism"}
   │          └─ service slugifies → 'baptism', inserts (or returns existing)
   │               └─ chip appears selected; icon+color snap to its defaults
   │
   ├─ clicks the color +, dials #2E7D9A, "Add to palette"
   │     └─ POST /calendar/palette {hex:"#2E7D9A"}  → swatch joins the grid for every admin
   │
   ├─ clicks the "None" icon tile → icon = 'none'
   │
   └─ Save → POST /calendar/events {event_type:'baptism', color:'#2E7D9A', icon:'none'}
             │  FK check: 'baptism' exists ✓   CHECK: hex shape ✓
             ▼
        GET /calendar → resolveColor('#2E7D9A') → deriveRamp → {dot,text,bg,highlight}
             │
             ├─ CalendarGrid chip: highlight fill, text on top, no icon
             ├─ DayEventsModal: "Baptism"
             └─ Export PNG: same DOM, same colors, no extra work
```

## Security callouts

- **Added:** `POST /calendar/event-types`, `POST /calendar/palette`, `DELETE /calendar/palette/{id}` all sit inside the existing `RequireAdmin` group. Reads are public, consistent with `GET /calendar`.
- **Injection:** `color` reaches an inline `style={{ backgroundColor }}`. Defence is three-deep - `IsAllowedCalendarColor` regex in the model, `CHECK (hex ~ ...)` on the palette table, and React's own attribute escaping. A value like `red; background-image:url(...)` fails the regex.
- **Slug:** validated `^[a-z0-9_]{1,40}$` server-side after slugification, and constrained by the FK. It never reaches a URL path or a raw query.
- **`ON DELETE RESTRICT`:** an event type in use cannot be deleted, so no event can end up pointing at a missing type. Relevant now that a delete endpoint is foreseeable.
- **No gap closed or opened** in the address-visibility logic - untouched.

## Known gaps (deliberate, flag before shipping)

1. **Custom type labels are not translated.** The translation pipeline covers event `title` and `notes`; a label typed as "Baptism" shows as "Baptism" on `/vi`. Built-in labels have the same limitation today.
2. **`event_type === 'birthday'` still drives layout**, not just styling - the cake marker, the 2-row cell budget (`CalendarGrid.tsx:49`), and the Birthdays sidebar strip. A custom type called "Kids' Birthdays" gets whatever icon and color it is given, but not the cake treatment. Correct for v1; worth a `layout_hint` column if it ever comes up.
3. **No rename/recolor/delete for types**, per the locked decision. Deleting needs a "what happens to events using this" answer that v1 doesn't owe.

## Scope estimate

| Phase | Estimate |
|---|---|
| 1 - Database (migration up + down, local apply, verify existing rows survive the enum→text cast) | ~45 min |
| 2 - Backend (model tests first, then model/repo/service/handler/routes) | ~2 h |
| 3 - Frontend form (`color.ts` + tests, three pickers in `EventModal`) | ~2.5 h |
| 4 - Display + docs (6 call-site swaps, icon-less chip, 5 doc files) | ~1 h |

Riskiest step is the enum→text cast in Phase 1 - it rewrites a production column. It is additive
in effect (every existing value survives as the identical text), but it is the one step to run
against a local DB first and read the row count on both sides.

---

# SHIPPED - Flexible About page (block-based page content)

**Status:** shipped (commits `56404a0`, `faf12de`, `0b9de28`, `968170c`, `a0f774e`).

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
