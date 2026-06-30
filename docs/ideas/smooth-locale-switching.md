# Idea: smooth, reload-free language switching (deferred)

> **Status:** DEFERRED - idea, not built. Captured 2026-06-27.
> **What actually shipped (2026-06-27):** `localePrefix` was changed from
> `'as-needed'` to `'always'` - i.e. the "cheaper middle option" in section 7
> below is what we adopted, not the hard-nav-on-`as-needed` plan. Every locale
> is now explicitly prefixed (`/en`, `/vi`), which removed the unprefixed-default
> ambiguity that caused the whole bug cascade (freeze, stale `useLocale`,
> `usePathname` not stripping, "reloads but doesn't change"). The switch is still
> a hard navigation (`window.location`) to an always-prefixed URL, so it reloads
> on every switch. Cost paid: English URLs now carry an `/en` prefix and bare `/`
> 301s to `/en`.
> **Pick THIS (the custom layer) up only if** the reload flash becomes a real,
> voiced complaint from actual visitors. For a pre-launch ~100-member site it
> very likely won't - so don't build it out of guilt. Build it because someone
> asked for it.

Hey future me. This is the plan for getting *instant, in-place* language
switching back **without** giving up the SEO-friendly `/vi/` URLs. Everything you
need to restart cold is here: why the easy path breaks, the one insight that
makes the hard path worth it, a phased build plan, and the traps that will bite
you. Read the "hard parts" section before you write a line of code.

---

## 1. The bug that started all this

On production (not dev), switching language could freeze the switcher:

1. Load `/` (English) - fine.
2. Switch to VI -> `/vi`, content + switcher both Vietnamese - fine.
3. Switch back to EN -> content flips to English, **but the switcher stays
   highlighted on VI**, and then **no further switch works** - frozen.

It only reproduced in a **production build** (`next build && next start`), never
in `next dev`. That divergence is the whole tell (see root cause below).

## 2. Why the easy path breaks (root cause)

Locale is the **top `[locale]` route segment** (`/vi/events`). So switching
language is a *route change*, which is a server round-trip and a **remount** of
the subtree under `app/[locale]/layout.tsx`.

We use `localePrefix: 'as-needed'` (English is unprefixed: `/`, `/events`;
Vietnamese is prefixed: `/vi`, `/vi/events`). That asymmetry is the sharp edge:

- Switching **to** the prefixed locale (`/` -> `/vi`) changes a visible URL
  segment, so Next re-renders the `[locale]` layout - works.
- Switching **to** the unprefixed default (`/vi` -> `/`) does **not** reliably
  change the segment Next keys on, so in a production build (static generation +
  Router Cache + prefetch all active) Next **reuses the cached `[locale]` layout
  segment**. The page content (server-fetched from the URL) updates to English,
  but `NextIntlClientProvider` keeps its old `vi` value. `useLocale()` goes
  stale -> switcher highlights VI -> `active` is wrong -> every later click
  no-ops (`if (target === active) return`) -> frozen.

This is a known next-intl footgun, not our mistake:
- https://github.com/amannn/next-intl/issues/1845 (`redirect` ignores locale with `as-needed`)
- https://github.com/amannn/next-intl/issues/786 (locale switches to previous choice on nav)

Passing `locale={locale}` explicitly to the provider (committed in `3ba85e4`)
fixes **dev** but not **prod**, because in prod the layout that would carry the
new prop never re-renders. That's why we fell back to the hard-nav.

## 3. The one insight that makes the hard path worth it

Locale is quietly doing **three different jobs**, and today all three are welded
to a single mechanism (the URL segment):

| Job | What it actually needs | Where it *wants* to live |
|---|---|---|
| 1. Pick the UI string bundle (buttons, labels) | just a value | 100% client-side, instant |
| 2. Pick the translated post/event content | a backend call (`?locale=vi`) | server or **client** fetch |
| 3. Be a shareable, crawlable address | a real URL | the URL bar, for SEO |

The switch is heavy because we force a full route change just to flip **job #1**,
which never needed the server at all. The framework didn't impose that - **the
welding did.** "Going lower level" is only worth it if we use it to **un-weld
these three jobs** and let each live where it belongs. That is the entire idea.

## 4. The architecture (un-welded)

Keep next-intl for what it's good at (ICU formatting, plurals). Take *switching*
out of its hands.

- **Job #1 - a custom `LocaleProvider` (ours, client-side).** Holds `locale` in
  React state, seeded from the URL on first mount. It renders next-intl's
  `<NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>`.
  Both message bundles are available client-side, so switching the UI strings is
  a `setState` - instant, no reload, no remount.
  - Precedent already in the codebase: `lib/auth.tsx` seeds `AuthProvider` from a
    module-scoped `authSnapshot` so it doesn't flash back to `loading` on remount
    (see `project_locale_switch_ux` memory). Same trick - seed client state once,
    don't re-derive from the server on every render.
- **Job #2 - content re-fetches client-side, keyed by locale.** Data components
  read locale from our provider and fetch with a cache key that *includes* the
  locale (SWR / React Query, or a small custom hook over `lib/api.ts`). Change
  locale -> key changes -> it re-fetches `?locale=vi` from the Go backend and
  swaps content in place. No navigation. The backend already supports
  `?locale=` on every read path (`listPosts`, `getMonth`, `getPageContent`), so
  the server side needs **no** changes.
- **Job #3 - the URL updates via the History API.** On switch, call
  `history.replaceState(null, '', '/vi/events')` - **not** a Next route change.
  The address bar shows `/vi/events` so a share / refresh / crawler still gets a
  correctly SSR'd Vietnamese page, but the in-session switch never triggers the
  remount that breaks.

**Net result:** instant, reload-free switching **and** we keep `/vi/` URLs +
per-language SEO. That "have both" outcome is exactly what the URL-coupling
prevents today.

## 5. Phased plan (per AGENTS.md format)

Order matters - each phase must work before the next.

### Phase 1 - Client locale source of truth
| File | Change | Why |
|---|---|---|
| `frontend/lib/locale-context.tsx` (new) | `LocaleProvider` + `useAppLocale()`. State seeded from `params.locale` / `usePathname` on mount; module-scoped snapshot so remounts don't reset it. | One client-owned locale value that a `setState` can flip - the thing the URL can't give us cheaply. |
| `frontend/app/[locale]/layout.tsx` | Wrap children in `LocaleProvider`, feed `NextIntlClientProvider` `locale` + `messages` from it. | Makes next-intl's messages follow our client state instead of the route. |
| `frontend/messages/*` (loading) | Ensure both bundles are loadable client-side (static import of both, or dynamic import on switch). | Job #1 must not need a server round-trip. |

### Phase 2 - Switch without a route change
| File | Change | Why |
|---|---|---|
| `frontend/components/ui/LanguageSwitcher.tsx` | Replace `window.location.assign(...)` with: `setLocale(target)` + `history.replaceState(..., getPathname({href, locale: target}))`. Keep `markLocaleSwitch`/`confirmDiscard`. | The actual smoothness win - flip state + cosmetic URL, no remount. |
| `frontend/lib/locale-transition.ts` | Probably retire scroll-restore (no reload = no scroll loss). Keep the "skip fade" idea if a crossfade is wanted. | Its whole job was surviving a remount we no longer cause. |

### Phase 3 - Content follows locale client-side
| File | Change | Why |
|---|---|---|
| `frontend/lib/api.ts` + resource libs (`posts.ts`, `pages.ts`, `events.ts`, calendar) | Add a client-fetch hook keyed by `useAppLocale()` (SWR/React Query or custom). | Job #2: content swaps in place when locale changes. |
| Each data surface (`app/[locale]/**`, `components/features/**`) | Read locale from the provider; re-fetch on change instead of relying on server props. | Server props are fixed at the URL's locale; in-session switch needs a client refetch. |
| First-paint / SSR | Server still renders the URL's locale; client hydrates to the SAME locale, then is free to switch. | Hydration must match the URL exactly or React throws. |

### Phase 4 - Reconcile the two routers + edge cases
| File | Change | Why |
|---|---|---|
| `LocaleProvider` | Sync with browser back/forward (`popstate`): when the URL locale changes under us, update state. | We pushed URL changes behind Next's back; the back button must still work. |
| Internal `<Link>`s | Confirm next-intl `Link` still prefixes correctly given our manual URL edits. | A desync here sends users to the wrong-locale URL on the next click. |
| Admin surfaces | Admin deliberately uses English source (no `?locale`); make sure the client layer respects that. | Don't translate the admin editor - admins work in canonical English. |

## 6. The hard parts (read this before you start)

- **Hydration is unforgiving.** First client render must match the URL's locale
  byte-for-byte or you get hydration errors. Seed from the URL, switch only
  *after* mount.
- **You are now refereeing two routers.** Next's client router caches route
  state; your `history.replaceState` happens behind its back. Get `popstate` +
  internal `<Link>` interaction wrong and the back button / next navigation lands
  on the wrong locale. This is the part that bites people - budget for it.
- **Every data surface needs a client-refetch path**, not just the current
  server fetch. That's the bulk of the work and the easiest to under-scope.
- **Loading states mid-swap.** Content refetch isn't instant like the UI strings;
  decide whether to show stale-while-revalidate or a skeleton.
- **It's permanent maintenance.** A custom i18n layer is yours forever, including
  across Next major upgrades that may change Router Cache / RSC behavior.

## 7. Decision log - why we shipped hard-nav instead (2026-06-27)

The hard-nav and this custom layer **produce the same outcome** (correct locale,
clean `/vi/` URLs, SEO intact) and differ on exactly **one** thing a visitor can
perceive: hard-nav reloads the page; the custom layer doesn't. But they differ by
an **order of magnitude** in cost and risk:

- Hard-nav: 1 file, done, ~zero new bug surface (a full reload re-inits
  everything from the URL - no stale-state bug can exist).
- Custom layer: new provider + every data surface + History/router juggling +
  hydration care + permanent maintenance.

For a once-per-visit toggle on a small church site, a fast reload (scroll
preserved, fade skipped) is fine. Hard-nav also **locks us into nothing** - we
can build this layer later if real demand shows up.

**Cheaper alternative if "smooth" is the only goal:** switch
`localePrefix: 'as-needed'` -> `'always'` in `frontend/i18n/routing.ts`. English
becomes `/en/...` too, the asymmetry vanishes, soft-nav switching works in both
directions in-framework - one-line change, no custom code. The **only** reason we
didn't is the deliberate "clean English URLs" choice (see the comment in
`routing.ts`). So this whole custom layer only earns its keep if you want clean
**English** URLs *and* smoothness *and* you've decided that combo is a real
product priority - not a nice-to-have.

## 8. Where to start when you pick this up

1. Re-read `project_locale_switch_ux` memory + this doc.
2. Decide first whether `localePrefix: 'always'` is good enough. Try it in a
   local prod build (`next build && next start`) and click EN<->VI repeatedly. If
   that smoothness satisfies you, **stop here** - you just saved weeks.
3. If clean English URLs are non-negotiable, build Phase 1 in isolation and prove
   `useLocale()` flips on `setState` with **zero** route change, before touching
   any content.
4. Only then wire Phase 3 content refetch, one surface at a time (start with the
   homepage posts), so you can ship/validate incrementally.

## 9. Relevant files (entry points)

- `frontend/components/ui/LanguageSwitcher.tsx` - the switch (currently hard-nav)
- `frontend/app/[locale]/layout.tsx` - where `NextIntlClientProvider` mounts
- `frontend/i18n/routing.ts` - `localePrefix`, locales, `getPathname`
- `frontend/lib/locale-transition.ts` - scroll/fade carry-over (reload-era)
- `frontend/lib/auth.tsx` - `authSnapshot` precedent for client-seeded state
- `frontend/lib/api.ts` + `lib/posts.ts` / `lib/pages.ts` - locale-aware fetches
- Backend `?locale=` read path: `backend/internal/repository/posts.go`
  (`COALESCE(translated_text, source)` - already locale-aware, no change needed)
