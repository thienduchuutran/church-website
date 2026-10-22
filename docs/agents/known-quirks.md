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

## Admin posts land in Discord under their @handle instead of the name everyone knows
**Date solved:** 2026-10-21
**Symptom:** A newly linked admin ("Nghi" in the server) tested a post and it appeared in Discord
as `sarahbearaht`. The link flow had "succeeded" and the admin card showed the same handle.
**Root cause:** The OAuth flow used scope `identify` and stored `global_name` with a fallback to
`username`. `global_name` is the *account* Display Name, which many people never set. "Nghi" was a
**server nickname**, a per-server field that `GET /users/@me` cannot return at all. So the code
fell through to the handle exactly as written. Telling every future admin to go set an account
Display Name does not scale, and it still would not match a server nickname.
**Fix:** The consent URL now asks for `identify guilds.members.read`. `discord.ResolveIdentity`
fetches the profile, then (only when `DISCORD_GUILD_ID` is set) the admin's own member record in
that server, and lays nickname/server-avatar over the account values. Ladder: nickname -> Display
Name -> handle. Not a member or any Discord error = keep the account identity and still link.
Already-linked admins must click **Re-link** once; the stored name only refreshes in the callback.
**Files affected:** `backend/internal/discord/oauth.go` (+ `_test.go`),
`backend/internal/handler/discord_oauth.go`, `backend/.env.example`, `docs/agents/discord.md`,
`docs/agents/deployment.md`. Render needs `DISCORD_GUILD_ID` set or nothing changes.

## A firm, slightly rolling touch on the month grid opened the day sheet instead of swiping
**Date solved:** 2026-10-21
**Symptom:** On a phone, starting a swipe with a heavy thumb - the finger lands
and rolls 5-8px before lifting - opened the day sheet (or, for an admin, the
create-event modal) for whatever day was underneath, even though the grid had
visibly moved under the finger.
**Root cause:** Two layers. The browser synthesizes a click for any touch
that stays inside its own tap slop (~10px), and the click guard only compared
the click's X to the pointerdown X with a 10px allowance, so an 8px roll that
had already started motion's drag (3px default threshold) and moved the track
5px still passed as a tap. Reproduced on production with CDP touch: an 8px
roll moved the track 5px and opened the sheet.
**Fix:** The guard now swallows a click when the drag started, when the
pointer travelled more than 8px on either axis, or while the track is
settling - all reset at every pointerdown. And the drag itself has a dead
zone: the track uses `dragListener={false}` and the wrapper starts the drag
with `trackDrag.start(e, { distanceThreshold: TAP_SLOP_PX })`, so nothing
moves for the first 8px (the platform's own tap slop) and a lift inside it is
a clean tap.
**Trap found on the way:** with `dragListener={false}` motion no longer sets
`touch-action` on the element. Every drag then died on its first move - the
browser claimed the horizontal touch as a pan and fired `pointercancel`. The
track now declares `touch-action: pan-y` itself. If a motion drag ever
"starts then snaps back instantly" on touch, check the computed touch-action
before anything else.
**Files affected:** `frontend/components/features/calendar/CalendarShell.tsx`.

---

## The month grid briefly showed the previous month's chips on the new month's day numbers
**Date solved:** 2026-10-21
**Symptom:** Arrow or swipe from October to November and, for the length of the
fetch, November's grid carried October's chips on the matching day numbers -
dimmed to 40% by the loading fade, which is why it went unnoticed. On a slow
connection it was plainly visible.
**Root cause:** `fetchMonth` never cleared `events` on a month change - the old
array stayed in state until the new response replaced it - and `CalendarGrid`
keys chips by **day number only** (`parseInt(e.date.split('-')[2])`, no month
check), so October's "Oct 3" chip rendered in November's "3" cell. The
shell-wide `opacity-40 pointer-events-none` fade was masking it, not fixing it.
**Fix:** The shell no longer holds month data in state. It derives it from the
month cache (`lib/month-cache.ts`, `lib/use-month-cache.ts`) via
`read(year, month)`, so the grid can only ever receive the entry for the month
it is showing - a different month's events are structurally unreachable. The
same change makes revisited months instant and prefetches the neighbours.
**Rule of thumb:** data that is keyed by one dimension on screen (the month)
must be looked up by that dimension, not left in state across changes of it.
**Files affected:** `frontend/components/features/calendar/CalendarShell.tsx`,
`frontend/lib/month-cache.ts`, `frontend/lib/use-month-cache.ts`,
`frontend/lib/__tests__/month-cache.test.ts`.

---

## Category-coloured text is unreadable in dark mode wherever it has no fill behind it
**Date solved:** 2026-10-19
**Symptom:** In dark mode the birthday name under its cake was too dim to read - in the grid and again in the info strip's Birthdays column. Reported as "the red names", but it was never specific to red.

**Root cause:** A palette entry is four values, and `text` is deliberately the **dark** one, because almost everything using it supplies its own light `highlight` fill to sit on (a chip, a banner, the day modal's `colors.bg` wash). With a fill, the page behind is irrelevant and dark ink is right in both themes.

The birthday chip is the one chip with *no* fill - a cake with a name under it, painted straight onto the page ground, which flips `#f9f8ff` → `#17101a`. Measured against the dark ground **every** palette colour fails WCAG AA, not just rose: violet 2.63:1, slate 2.46:1, rose 2.97:1, and `black` **1.04:1** - invisible, not merely dim.

The same shape had already bitten twice: `deriveRamp().text` on `MonthThemeCard` (fixed 2026-09-15) and the accent-coloured labels before it. The warning was written into `docs/agents/frontend.md` at the time; the birthday chip was simply never checked against it.

**Fix:** Light mode keeps the event's own colour, which reads fine there (rose 5.96:1 on the near-white page). **Dark mode uses one warm gold** (`--birthday-ink: #FCD34D`, 12.94:1) for every birthday regardless of the event's colour - it carries the candle warmth the cake already suggests and makes birthdays recognisable at a glance among the other chips.

The owner chose the fixed gold over a derived per-event tint. The trade, taken deliberately: an admin's per-event colour stops showing on the name in dark mode. That colour was decorative here rather than categorical - nothing reads meaning off a birthday's hue the way it does off an event type.

Done in CSS, not JavaScript: `EventChip` is a server component with no `window.matchMedia`, and a JS swap would render the light-mode colour first and correct itself after hydration. The component passes the light-mode colour as `--ink-light` and `.birthday-name` in `globals.css` swaps to the gold. The PNG export still captures the computed value.

**The trap inside the fix, which cost a deploy:** the first version used only `@media (prefers-color-scheme: dark)`, and did nothing at all in a real browser. This project uses **next-themes**, which writes an explicit `.light` or `.dark` class onto the root once JS runs - *including* when the visitor's choice is "system". So the media query only matches pre-hydration or with JS disabled; `.dark` is what actually carries dark mode. A dark-mode rule written with just the media query compiles, deploys, verifies green in the bundle, and has no effect. **Always pair the two**, exactly as the colour tokens at the top of `globals.css` do:

```css
.thing            { color: var(--light-value); }
.dark .thing      { color: var(--dark-value); }
@media (prefers-color-scheme: dark) {
  :root:not(.light):not(.dark) .thing { color: var(--dark-value); }
}
```

Components reading the theme in JS must use `useTheme().resolvedTheme` from next-themes for the same reason - a raw `matchMedia('(prefers-color-scheme: dark)')` listener ignores the toggle. `MonthThemeCard.useAccentInk` does this correctly.

`DayEventsModal` is deliberately **not** changed - its rows sit on `colors.bg`, a light wash in both themes, so dark ink is correct there.

**The rule to carry forward:** `colors.text` and `deriveRamp().text` are *always dark*. Anything painting a category or accent colour directly onto the page ground needs both ends of the ramp. Check for a fill before reaching for `text`.

**Files affected:** `frontend/app/globals.css`, `frontend/components/features/calendar/EventChip.tsx`, `frontend/components/features/calendar/CalendarShell.tsx`

---

## Desktop nav dropdowns (News, Account) close mid-drag on a slow hover
**Date solved:** 2026-10-19
**Symptom:** Opening the News dropdown (or the signed-in Account menu) by
hovering, then moving the cursor down toward the two options slowly, made
the panel disappear before the cursor reached it. Moving quickly worked
fine - only a slow, deliberate drag reproduced it.
**Root cause:** The dropdown trigger (`<li>` for News, a `<div>` for
Account) opens/closes on `onMouseEnter`/`onMouseLeave`. The panel itself
(`MENU` in `Navbar.tsx`) is `position: absolute` with a `mt-1` gap below
the trigger. An absolutely positioned child does not extend its parent's
layout box, so that 4px gap is not part of the trigger's hit-testable
area - geometrically it belongs to whatever sits behind it (the nav bar),
not to the trigger or the panel. A fast drag's mouse-move samples skip
straight from "over the trigger" to "over the panel" without ever
landing in the gap, so no premature `mouseleave` fires. A slow drag
samples a point inside the gap, which IS outside the trigger's subtree,
firing `mouseleave` immediately and closing the panel (`hidden` class ->
`display: none`) before the cursor physically arrives.
**Fix:** Don't close on `mouseleave` instantly - schedule the close
(`HOVER_CLOSE_DELAY_MS = 200`) and cancel it (`cancelScheduledClose`) if
the pointer re-enters before it fires. Reaching the panel after crossing
the gap re-fires `mouseenter` on the trigger (panel and trigger share the
same disclosure subtree), which cancels the pending close in time. The
same cancel call was added to every other path that changes
`desktopDropdown` (Escape, click-outside, focus-out, route change, the
click-to-toggle buttons) so a stale timer from a previous hover can never
fire after one of those has already changed the open dropdown.
**Files affected:** `frontend/components/ui/Navbar.tsx`.

---

## The mobile calendar grid never went edge-to-edge, and its edge columns were quietly cut off
**Date solved:** 2026-10-19
**Symptom:** On phones the month grid sat inset from both screen edges instead
of running full-bleed (*tràn viền*) the way Google Calendar's app does, even
though `CalendarGrid`'s mobile block carried a `-mx-3` whose stated job was to
break it out of the wrapper's padding. The Sunday and Saturday columns also
rendered visibly narrower than the middle five.
**Root cause:** Two separate things.
1. The bleed was escaping only ONE of two nested paddings - the page shell had
   `px-4` and the calendar box inside it had `p-3`, so `-mx-3` cancelled 12px
   and left 16px.
2. Worse, `-mx-3` sat *inside* `CalendarShell`'s month-slide viewport, which is
   `relative overflow-hidden`. A negative margin on a child of an
   `overflow-hidden` element does not widen anything - the element gets wider,
   then the parent clips the overhang at its own padding box. Measured at a
   375px client width: the grid box ran 16 -> 359.2 while the clip box ran
   28 -> 347.2, so 12px was shaved off each edge column (49px cells rendering
   37px visible at the two ends).
**Fix:** One padding instead of two nested ones, and the bleed moved onto the
element that clips.
- `CalendarPageClient`: page shell drops its phone gutter (`px-4` -> `px-0`,
  `sm:`/`lg:` gutters untouched); the calendar box takes it instead
  (`p-3` -> `px-4 py-3`). Deliberately NOT a container variant - export forces
  that element to 1100px, so an `@`-variant there would resolve against the
  phone viewport.
- `CalendarShell`: the slide viewport becomes
  `relative overflow-hidden -mx-4 @3xl:mx-0` - it is the clipping box, so the
  bleed has to live here. `@3xl` resets it for the framed desktop grid and for
  the PNG export (which forces 1100px, switching that container to `@3xl`).
- `CalendarGrid`: mobile block drops its own `-mx-3`; it now just fills the
  width it is handed.
Result at 390px: grid spans the full client width from x=0, cells 49px -> 53.6px
(+9%), and the two edge columns stop being clipped. Desktop and export are
unchanged (slide wrapper still inset by the box's padding).
**Rule of thumb:** a full-bleed negative margin must be applied to the nearest
`overflow-hidden` ancestor, not to something inside it.
**Files affected:** `frontend/app/[locale]/calendar/CalendarPageClient.tsx`,
`frontend/components/features/calendar/CalendarShell.tsx`,
`frontend/components/features/calendar/CalendarGrid.tsx`.

---

## The Locations strip shows two rows for what is obviously one address
**Date solved:** 2026-08-01
**Symptom:** After migration `000014`, the calendar footer prints the same address twice - once
labelled (`Church - 101 Main St, Saugus MA`) and once bare (`101 Main St, Saugus MA`). The dedupe
that this whole feature exists to provide appears broken.

**Root cause:** Not broken - the two rows are keyed differently on purpose. `000014` has **no
backfill**, so every event that existed before it has a `private_address` but a null `place_id`.
`groupEventsByPlace` (`frontend/lib/places.ts`) keys a resolved event on `place:<uuid>` and a legacy
one on `address:<lowercased address>`. Those keys can never collide, so a legacy event will not merge
into a resolved place even at a byte-identical address.

This is deliberate. Merging them would require the frontend to decide whether two typed addresses are
the same place - reimplementing `model.NormalizeAddressKey` in TypeScript, where it would silently
drift from the Go original that the database's `address_key` UNIQUE constraint depends on. One
normalizer, server-side, is the rule.

**Fix:** Open the older event and save it. Resolution runs on write, so it picks up its `place_id`
and the rows merge. Nothing else is needed, and it is pinned by a test
(`"a legacy event does not merge into a resolved place"`) so the behaviour stays a decision rather
than a regression.

**Related trap in the same area:** when editing `NormalizeAddressKey`, the state table is consulted
for the **final token only** and must then *fall through* to the street-type table. Skipping that
fallthrough (to keep `Hartford, CT` = Connecticut from becoming Court) breaks bare addresses:
`101 Main St` stops matching `101 Main Street`, which half the seeded dev data is written as. Both
directions are covered in `internal/model/address_test.go`.

**Files affected:** `frontend/lib/places.ts`, `backend/internal/model/address.go`,
`backend/migrations/000014_calendar_places.up.sql`

---

## Traps to know before touching bidirectional translation (migration 000013)
**Date solved:** 2026-07-29
**Symptom:** Not a bug report - a list of things that looked fine and were not,
found while making the calendar accept Vietnamese-authored content. Each one
fails silently.
**The traps:**
1. **`Translator.TranslateField` used to refuse English targets** -
`if targetLocale == "" || targetLocale == "en" { return sourceText }`, commented
"the English locale is the source of truth, never translated". Any reverse-direction
job would have returned its input unchanged, with no error. The guard is now
"target equals source".
2. **`PromptCache` ignored its own key argument.** It stored a single `content`
string while accepting `key`, so with two prompts (`vi_translation`,
`en_translation`) whichever direction translated first would serve its prompt to
the other for the rest of the 5-minute TTL - Vietnamese output for an English
target, no error anywhere. Now a map.
3. **`"en"` is not in `t.supported`.** `SUPPORTED_LOCALES` lists only non-English
targets, so `if !t.supported[locale] { continue }` drops every reverse job.
`TranslateRecord` special-cases English.
4. **Empty locale changed meaning.** It used to be interchangeable with `"en"`
(the source column *was* English); now it means "raw stored text, no translation".
The HTTP handler defaults an absent `?locale=` to `"en"` because the frontend
omits the param for English viewers - without that default, an English reader gets
Vietnamese-authored events untranslated.
5. **`fine_tuning_examples` would have been poisoned.** It is
`(source_en, approved_vi)`; a VI → EN approval inverts the pair, and its English
side is machine output a human accepted rather than human-authored English.
Gated on `t.Locale == "vi"`. See `docs/FINE_TUNING_PLAN.md`.
6. **A `source_locale` flip orphans a translation.** Rewrite an English event in
Vietnamese and its old `locale='vi'` row now describes the language the record
holds natively - it sits in the review queue with the same language on both sides
of the diff. `DeleteTranslationsForLocale` purges it regardless of approval status.
7. **Detection must be proportional, not presence-based.** The first version
treated any Vietnamese character as proof, so "Youth Retreat - Hội thánh" filed as
Vietnamese - meaning a mostly-English post with one borrowed church term got
translated the wrong way. The rule is a word-share threshold
(`vietnameseWordRatio`), which as a side effect makes accented vowels safe to
count: one "café" in an English sentence is 8% of the words, but excluding accents
outright made ordinary Vietnamese like `Thánh Kinh Hè` undetectable.
**Files affected:** `backend/migrations/000013_source_locale.{up,down}.sql`,
`backend/internal/translation/{detect,prompt,translator,queue,worker,models}.go`,
`backend/internal/{model/types,repository/calendar,service/calendar,service/translation,handler/calendar}.go`,
`frontend/components/features/calendar/{types.ts,EventModal.tsx}`,
`frontend/components/features/admin/TranslationReviewRecord.tsx`, `frontend/lib/calendar.ts`

## Calendar event chips flash Vietnamese then snap back to English on a locale switch
**Date solved:** 2026-07-29
**Symptom:** Signed in as an admin, switching EN<->VI on `/calendar` made every
event chip render in Vietnamese for ~200ms and then jump back to English. Roughly
1 in 50 switches the Vietnamese text stuck instead. No other page did this, and a
plain hard refresh of `/vi/calendar` reproduced it without any switching.
**Root cause:** Two separate defects in `CalendarShell`, stacked.
(1) The request locale is derived from `isAdmin` (`isAdmin ? undefined : locale` -
admins read the English source so the edit modal pre-fills canonical text), but on
the client `isAdmin` is `false` until `/auth/me` answers. The locale switch is a
*hard* navigation (`LanguageSwitcher` uses `window.location.assign`), which wipes
the module-scoped `authSnapshot` in `lib/auth.tsx` that normally makes remounts
seamless - so the new document always starts as "not an admin". The fetch effect
fired immediately with `?locale=vi`, painted Vietnamese, then `requestLocale`
flipped to `undefined` once auth resolved and it refetched in English.
(2) `fetchMonth` had no cancellation or sequence guard, so the two overlapping
requests for the same month raced on `setEvents` - last to *resolve* won. The
Vietnamese request starts first but isn't always first back (bigger payload from
the translation COALESCE join), which is the random 1-in-50 stuck case.
**Fix:** The premise was wrong, so the fix removed it rather than papering over
the timing. **The calendar now serves every viewer the locale they picked,
admins included** - `requestLocale` is just `locale`, with no `isAdmin` in it, so
there is no auth-dependent refetch and the flash cannot occur.

That alone would have corrupted data, which is what the original rule was
clumsily protecting: `CalendarEvent` has a single `title`/`notes` field that the
backend COALESCEs to *either* source or translation, and `EventModal` pre-fills
from the event object in `CalendarShell`'s fetched list. An admin opening an event
on `/vi` and hitting Save would write the Vietnamese back into the English source
column, after which the worker re-translates Vietnamese into Vietnamese. So the
localized response now *also* carries the untranslated text -
`title_source` / `notes_source` on each event and `content_source` on the month
note - and `EventModal` pre-fills from those (`event?.title_source ?? event?.title`).
Those fields cost nothing to produce (the translation row is already joined) and
are stripped for non-admins in `handler/calendar.go`, in the same
`AdminEmailFromContext` block that strips `private_address`.

Two independent hardening changes came out of the same investigation: a
`requestSeq` ref in `fetchMonth` discards stale responses (and stale
`setLoading(false)` calls), which fixes the 1-in-50 race and fast month-arrow
clicking; and `supabase.auth.getSession()` in `lib/auth.tsx` gained the `.catch()`
it never had - it previously left `loading` true forever if the call rejected.
**Design rule this establishes:** locale follows the *route*, never the viewer's
role. Admin tokens control which **fields** come back, not which **language**.
The display-vs-edit-surface distinction is written up in `docs/agents/frontend.md`
under "Locale-aware fetching".
**Files affected:** `frontend/components/features/calendar/CalendarShell.tsx`,
`frontend/components/features/calendar/EventModal.tsx`,
`frontend/components/features/calendar/types.ts`, `frontend/lib/calendar.ts`,
`frontend/lib/auth.tsx`, `backend/internal/model/types.go`,
`backend/internal/repository/calendar.go`, `backend/internal/handler/calendar.go`

## Clearing a calendar month note leaves a stale translation that "Clean up orphans" won't catch
**Date solved:** 2026-07-29 (added the `Dismiss` action)
**Symptom:** Admin clears the text in a month note (via the Notes modal, Save
with empty content) expecting the pending Vietnamese translation for that note
to go away too. It doesn't - the old translation row keeps showing on
`/admin/translations` with stale English source text that no longer matches
anything, and clicking "Clean up orphans" does not remove it.
**Root cause:** `UpsertMonthNote` (`backend/internal/repository/calendar.go`)
upserts on the `(year, month)` unique key - clearing the note overwrites
`content` to `''` on the *same row*, it never deletes the row. So the
`calendar_month_notes` parent still exists, which means the translation isn't
an orphan by the sweep's definition (`orphanConditions` in
`backend/internal/repository/translation.go` only matches translations whose
*parent row* is gone). Also, `TranslationService.UpsertMonthNote` only
enqueues a new translation job when `req.Content != ""`, so clearing the note
enqueues nothing - the stale row from the previous content is simply
abandoned in place.
**Fix:** Added a `Dismiss` action (`DELETE /api/v1/admin/translations/:id`)
that deletes a translation row without re-enqueueing - the "I don't want this
suggestion, and nothing needs to replace it" case, distinct from `retranslate`
(delete + requeue) and `cleanup-orphans` (parent-row-gone only). Shown as a
per-field button on `/admin/translations` for any still-pending (unapproved)
field.
**Files affected:** `backend/internal/handler/admin_translations.go`,
`backend/internal/service/translation.go`, `frontend/lib/translations.ts`,
`frontend/components/features/admin/TranslationReviewRecord.tsx`

## Vietnamese AI translations truncated to a single word ("VBS T-Shirt!" -> "Áo")
**Date solved:** 2026-07-19 (three commits: root cause, cache repair tool, stop-reason detector)
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
**Fix:** Three parts, in order. (1) Root cause: replaced the scaled formula
with a fixed generous `maxOutputTokens = 16384` constant passed to both
providers (thinking left on for quality). (2) Damage repair:
`cmd/repair-translations` purges `is_ai_generated AND approved_by IS NULL`
rows and atomically re-enqueues jobs rebuilt from the purged rows; executed
against prod on 2026-07-19 AFTER the fixed backend deployed (ordering matters -
the old worker would have re-poisoned the rows within its 5s poll). (3)
Detector: `callGemini` now rejects any response whose `finishReason != STOP`,
and joins all parts instead of taking the first, so the next silent truncation
fails loudly instead of persisting. The API endpoint became an injectable
Translator field so httptest-backed unit tests pin this behavior. (The Claude
path got the same detector, then was removed entirely later the same day -
the "pastoral" content tier it served never had real content.)
**Files affected:** `backend/internal/translation/translator.go`,
`backend/internal/translation/translator_test.go`,
`backend/cmd/repair-translations/main.go`

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

## Translation review pager jumped under the cursor on Next/Previous
**Date solved:** 2026-10-22
**Symptom:** On `/admin/translations`, scroll to the bottom and click Next or
Previous. The Previous/Next bar leaps up or drops out of view, so a second
click lands on the wrong thing or nothing.
**Root cause:** The old twenty record cards stay rendered while the next page
fetches (deliberate - no flash of empty space), then the new cards replace
them in one render. Every card has a different height because post bodies
differ, so the document gets taller or shorter in one step. With the scroll
pinned to the bottom the browser clamps it, and the bar that was under the
cursor moves. The content can never have a fixed height, so "fix the height"
is the wrong frame - the fix is to stop the reader's viewport from depending
on it.
**Fix (all in `frontend/app/[locale]/admin/translations/page.tsx`):**
- The Previous/Next bar is `sticky bottom-0` and the tab row is `sticky
  top-16` (the navbar is `h-16`), so both stay on screen whatever the list
  height. The page stays the only scroll container - a nested scroll panel
  was considered and rejected because phones handle inner scroll areas
  badly and it would show about one card at a time.
- `goToPage()` sets the page **and** scrolls a sentinel `<div>` above the tab
  row into view, honouring `prefers-reduced-motion`. It is called from the
  two pager buttons only. **Never move this into an effect on `page`** -
  approve, retranslate and dismiss all call `load()` and must leave the
  reviewer where they are; only an explicit page turn may move the view.
- The scroll target is a plain sentinel, **not the sticky tab row**. A stuck
  sticky element reports its stuck position to `scrollIntoView`, so
  targeting it scrolls almost nowhere. The sentinel carries `scroll-mt-20`
  (navbar 4rem + 1rem) so the tab row lands just below the navbar, unstuck.
- The list wrapper gets `opacity-50 pointer-events-none` while loading, so the
  swap reads as deliberate and nobody approves a card that is about to be
  replaced.
**Verified:** in a same-DOM harness at 1280px and 375px - after Next the
document shrank from 5859px to 2180px with zero change in scroll position,
tab row or pager placement, and no horizontal overflow from the bar's
negative margins. The signed-in page itself needs a Google admin session,
so confirm on the live page after deploy.
**Files affected:** `frontend/app/[locale]/admin/translations/page.tsx`.
