# docs/agents/frontend.md - Next.js Frontend Reference

## Framework
Next.js with the App Router (`/app` directory). React Server Components where possible, client components only when interactivity requires it.

## Styling
Tailwind CSS. No inline styles. No separate CSS files unless absolutely necessary.

**Design tokens and voice:** See repo-root **`DESIGN.md`** (human + machine-readable frontmatter) and **`DESIGN.json`** (sidecar: shadows, motion, component snippets). Canonical CSS variables live in **`frontend/app/globals.css`** (`:root` and dark `prefers-color-scheme` overrides).

**Form inputs and iOS zoom:** iOS Safari force-zooms the page when a focused input/select/textarea/contenteditable computes < 16px font-size. A global guard in `globals.css` ("iOS input-zoom guard") floors all editable controls at 16px on touch/phone screens - new forms are covered automatically, no per-component fix needed. Do NOT remove that rule, move it inside an `@layer`, or "fix" zoom by adding `user-scalable=no` / `maximumScale` to the viewport (accessibility violation). `text-sm` on inputs is fine for desktop; the guard overrides it on mobile.

---

## Folder structure
```
frontend/
├── app/
│   ├── globals.css                     ← Tailwind CSS entry point (lives at the root, imported by [locale]/layout.tsx)
│   ├── favicon.ico
│   └── [locale]/                       ← Every page lives here. Locale is "en" | "vi", resolved by next-intl middleware.
│       ├── layout.tsx                  ← The de-facto root layout: <html>, <body>, fonts, NextIntlClientProvider, Navbar, footer.
│       ├── page.tsx                    ← Homepage
│       ├── events/page.tsx
│       ├── announcements/page.tsx
│       ├── gallery/page.tsx
│       ├── resources/page.tsx
│       ├── about/page.tsx              ← Fetches from GET /api/v1/pages/about; falls back to defaults
│       ├── connect/page.tsx            ← Fetches from GET /api/v1/pages/connect; falls back to defaults
│       ├── calendar/page.tsx           ← Interactive calendar
│       └── admin/
│           ├── page.tsx                ← Admin dashboard (lists all posts, edit/delete, edit pages, link to translation review)
│           ├── [section]/page.tsx      ← Post creation form per section
│           ├── pages/[slug]/page.tsx   ← Auth gate + dispatch: about → PageBlockEditor, connect → SectionsEditor (same file)
│           └── translations/page.tsx   ← AI translation review panel (Phase 5)
├── i18n/
│   ├── routing.ts                      ← defineRouting() + createNavigation() - locale list, default, locale-aware Link/useRouter/usePathname
│   └── request.ts                      ← getRequestConfig - resolves locale + lazy-imports messages JSON
├── messages/
│   ├── en.json                         ← English UI strings (source of truth)
│   └── vi.json                         ← Vietnamese UI strings
├── proxy.ts                       ← next-intl middleware: detects locale, rewrites/redirects, sets NEXT_LOCALE cookie
├── components/
│   ├── ui/                             ← Reusable primitives, no business logic
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── ConfirmDialog.tsx           ← Destructive-action confirmation, on ModalShell. Summoned via useConfirm()
│   │   ├── Modal.tsx
│   │   ├── ModalShell.tsx              ← Animated sheet: portal, backdrop blur, Escape/click-out, size 'md' | 'sm'
│   │   ├── Navbar.tsx
│   │   ├── PageTransition.tsx          ← Fade-in wrapper; used in layout.tsx
│   │   └── SocialIconBar.tsx           ← Social follow icons; reused in Navbar (desktop) + footer
│   └── features/                       ← Feature-specific, may contain business logic
│       ├── posts/
│       │   ├── PostCard.tsx            ← The "Facebook-style" post card
│       │   ├── PostFeed.tsx            ← List of PostCards
│       │   ├── PastEventsCarousel.tsx  ← Swipeable strip of past events (homepage + /events)
│       │   └── ReactionBar.tsx         ← 👍 ❤️ 🙏 😂 row on each card
│       ├── pages/
│       │   └── PageBlocks.tsx          ← Block registry renderer for prose pages; skips unknown block types
│       ├── gallery/
│       │   ├── AlbumGrid.tsx           ← Grid of albums
│       │   └── RecentMoments.tsx       ← Flat photo grid
│       ├── admin/
│           ├── AdminControls.tsx        ← Per-post pencil/trash buttons
│           ├── AdminFeedActions.tsx
│           ├── AdminNav.tsx
│           ├── CreatePostForm.tsx       ← Wraps PostFormFields, POSTs new posts
│           ├── DiscordComposerNote.tsx  ← Create-only: "posts to #channel as <you>" + @everyone opt-in
│           ├── DiscordLinkCard.tsx      ← Dashboard card: one-time Discord OAuth link
│           ├── EditPostForm.tsx         ← Wraps PostFormFields, PATCHes existing posts
│           ├── EditPostModal.tsx        ← Modal chrome + portal hosting EditPostForm
│           ├── EventArchiveButton.tsx   ← Admin "Move to Past/Upcoming" toggle on event cards
│           ├── PageBlockEditor.tsx      ← Block builder for prose pages: add/remove/reorder sections + lite rich text
│           └── PostFormFields.tsx       ← Presentational inputs shared by Create/Edit
│       └── assistant/
│           ├── ChatBox.tsx             ← Floating AI assistant widget
│           ├── ChatMessage.tsx         ← Renders user/assistant chat bubbles
│           └── TypingIndicator.tsx     ← Animated thinking indicator for the helper
│   └── editor/                          ← Tiptap rich-text editor, shared by posts and page blocks
│       ├── RichBodyEditor.tsx           ← The editor. `variant="full"` = post composer, `variant="lite"` = page section
│       ├── RichContent.tsx              ← Read-only renderer; re-sanitizes on every render
│       ├── StatusBar.tsx                ← Word/char count (full only)
│       ├── constants.ts                 ← CALLOUT_VARIANTS, isTouchDevice
│       ├── extensions/
│       │   ├── CalloutBlock.tsx         ← Church callout node (full only)
│       │   └── Indent.ts                ← Paragraph/heading indent attribute → margin-left; Mod-] / Mod-[
│       ├── menus/                       ← SlashMenu, EmojiMenu (full only)
│       └── toolbar/                     ← PersistentToolbar (variant-aware), BubbleToolbar (full only)
├── lib/
│   ├── api.ts                          ← Generic fetch wrappers (apiGet/Post/Patch/Delete)
│   ├── auth.tsx                        ← Supabase auth context + useAuth hook
│   ├── calendar.ts                     ← Calendar API service (getMonth takes optional locale; event-type + palette CRUD)
│   ├── color.ts                        ← Custom-color math: deriveRamp/contrastRatio/normalizeHexInput. Expands one admin hex into the 4-value ramp the calendar paints with, guaranteeing WCAG AA on BOTH contrast pairs (see below)
│   ├── discord.ts                      ← Discord link API (getDiscordStatus / getDiscordLinkUrl)
│   ├── events.ts                       ← partitionEvents/isUpcoming/canUnarchive (Upcoming vs Past sectioning)
│   ├── confirm.tsx                     ← ConfirmProvider + useConfirm() promise dialog. NEVER use window.confirm/alert/prompt
│   ├── edit-modal.tsx                  ← EditModalProvider + useEditModal hook (in-place edit)
│   ├── pages.ts                        ← Page-content API service. Typed { sections, blocks, machine_translated } response; replacePageBlocks is a FULL replace (absent blocks are deleted server-side)
│   ├── places.ts                       ← groupEventsByPlace: the calendar's Locations strip, one row per VENUE not per event. A plain group-by on event.place.id - all address matching lives server-side (see below). `npm run test:places`
│   ├── post-types.ts                   ← Form state types, payload mapper, type-config tables
│   ├── posts.ts                        ← Post API service (list/get takes optional locale)
│   ├── posts.ts                        ← Post API service (list/get/create/update/delete)
│   ├── assistant.ts                    ← AI Assistant API service (chat endpoint)
│   ├── social.ts                       ← SOCIAL_LINKS constant (YouTube/Facebook/Instagram URLs)
│   ├── supabase.ts                     ← Supabase client (auth + direct public reads)
│   ├── translations.ts                 ← Admin translation review API (list/approve/retranslate/retranslate-all/cleanup-orphans)
│   └── uploads.ts                      ← Editor inline-image upload (uploadEditorImage → POST /uploads/image, returns permanent R2 URL)
├── public/
├── .env.local
└── next.config.ts
```

---

## Component conventions

- **Server Component by default.** Only add `"use client"` at the top when the component needs `useState`, `useEffect`, event handlers, or browser APIs.
- **One component per file.** File name = component name, PascalCase.
- **Props** should be destructured in the function signature.
- **No prop drilling beyond 2 levels.** If a value is needed 3+ levels deep, use React Context or fetch it at the point of use.

---

## i18n routing (next-intl)

Locale is a first-class segment in the URL: `/about` (English, default) or `/vi/about` (Vietnamese). The `localePrefix: 'as-needed'` setting in `i18n/routing.ts` keeps English URLs unprefixed so the canonical URL for SEO stays clean.

**Always import `Link`, `useRouter`, `usePathname` from `@/i18n/routing`** - never from `next/link` or `next/navigation`. The locale-aware versions auto-prefix the current locale onto every URL, so internal navigation stays inside whichever language the user picked without each call site having to remember.

| Source | When |
|---|---|
| `import { Link } from '@/i18n/routing'` | Internal navigation. The Link will prefix `/vi` automatically when the user is on Vietnamese. |
| `import { useRouter } from '@/i18n/routing'` | Programmatic navigation: `router.push('/admin')` keeps locale; `router.push('/admin', { locale: 'vi' })` forces a specific locale. |
| `import { usePathname } from '@/i18n/routing'` | Reading the pathname without the locale prefix. `/vi/events` returns as `/events` - matches what you wrote in `<Link href>`. |
| `import { useLocale } from 'next-intl'` | Client components that need the current locale string (e.g. to pass to a backend API call). |
| `import { getLocale } from 'next-intl/server'` | Server components / data fetchers. |
| `import { useTranslations } from 'next-intl'` | Read a message-bundle string. Works in both server and client components. Server components may also use the async `getTranslations` from `next-intl/server`. |

### Locale-aware fetching

Every resource service in `lib/` accepts an optional `locale` parameter:

- `listPosts({ locale })`, `getPost(id, locale)` → adds `?locale=vi` to `/posts` calls.
- `getMonth(year, month, accessToken?, locale?)` → adds `?locale=vi` to `/calendar` calls.
- `getPageContent(slug, locale)` (in `lib/pages.ts`) → adds `?locale=vi` to `/pages/:slug` calls.

**Rule:** the distinction is **display surface vs. edit surface**, never admin vs. visitor.

- **Display surfaces always pass the locale the viewer picked**, resolved via `getLocale()` (server) or `useLocale()` (client). This includes admins. A language toggle means "show me the site in this language" for everybody - an admin on `/vi/calendar` sees the same Vietnamese chips the congregation sees.
- **Edit surfaces must pre-fill the authored source**, because their Save writes straight back to the source column. Pre-filling a translation means the first save silently overwrites the source with a machine translation, and the worker then re-translates that language into itself.

> "The source" means English for posts and pages, but since migration `000013` a calendar record's source is whatever language the admin wrote it in (`source_locale`). Do not assume English anywhere in the calendar - read `source_locale`.

Two ways to satisfy the second rule, and which one a surface uses depends on whether it's *also* a display surface:

| Surface | Approach |
|---|---|
| Admin dashboard, edit modal, page editor (`listPosts`, `getPost`, `getPageContent`) | Omit the locale entirely. These pages exist to edit; there is no display copy to be localized, so the source can live in the display field itself. |
| `/calendar` (`getMonth`) | Pass the locale **and** send the admin token. The response then carries `title_source` / `notes_source` / `content_source` next to the translated `title` / `notes` / `content`, and `EventModal` pre-fills from the `_source` variants. |

### The calendar declares no language on write

`EventModal` has no language selector and sends no `source_locale` or `ui_locale`. The backend detects the language from the submitted text on every save (majority of words wins - see `docs/agents/backend.md`). Do not add a client-side language field: the UI locale is deliberately not an input, because what the panel is displaying says nothing about what the admin is typing.

An edit re-detects from the patched text, so rewriting an English event in Vietnamese moves it to the Vietnamese side by itself.

The calendar needs the second approach because it's one page doing both jobs - a public month view with admin edit affordances layered on it. The `_source` fields are stripped for non-admins in `handler/calendar.go`, in the same block that strips `private_address`.

**Never gate a request locale on `isAdmin`.** It reads `false` until `/auth/me` answers, so "not an admin" and "don't know yet" are indistinguishable, and a locale switch is a hard navigation that wipes the `authSnapshot` in `lib/auth.tsx` - meaning every switch starts from the wrong answer. A component that does this fetches one language, paints it, then refetches the other. See the flash entry in `known-quirks.md`. Derive the locale from the route, and let the token control which *fields* come back rather than which *language*.

### Calendar colors: `resolveColor` is the only entry point

A calendar event's `color` is **either** a named palette key (`'rose'`) **or** an admin's custom hex (`'#2E7D9A'`). Every renderer must go through `resolveColor(color)` from `components/features/calendar/types.ts`, which hides that difference and always returns the same `{ dot, text, bg, highlight }` shape.

**Never write `COLOR_MAP[event.color]` again.** That lookup silently falls back to slate for any custom hex, so the color would render correctly in the grid and wrong in, say, the birthdays sidebar strip. The one legitimate remaining `COLOR_MAP` use is `CalendarShell`'s static legend, which lists fixed built-in keys rather than event data.

Named keys return their hand-tuned values. A hex is expanded by `deriveRamp` in `lib/color.ts`, and the derivation is **two-sided on purpose**:

| Renderer | Fill | Text on it | Constraint |
|---|---|---|---|
| `EventChip` (single day) | `highlight` | `text` | `text` vs `highlight` ≥ 4.5:1 |
| `EventBanner` (multi-day) | `text` | white | `text` vs white ≥ 4.5:1 |

`deriveRamp` walks the text lightness darker until **both** hold. A fixed darkening step is not enough - yellow and cyan are far brighter at a given HSL lightness than blue or red, which is exactly the case `lib/__tests__/color.test.ts` sweeps (127 samples around the hue circle plus the known-hard hexes). Run it with `npm run test:color`; it uses Node's built-in runner with native TypeScript stripping, so there is no test dependency to install.

`dot` is never adjusted - it is the admin's exact choice, so the picker swatch matches what they picked.

The PNG export needs no involvement in any of this: `exportCalendarToPng` runs `html-to-image` over the live DOM, so whatever renders on screen is already in the export.

### The Locations strip is a list of places, not events

`CalendarShell`'s Locations strip renders **one row per venue**: `Church - 101 Main St, Saugus, MA 01906`. It used to map 1:1 over every event carrying an address, so eleven events at the church printed the church eleven times - and because the strip is deliberately *not* `data-export-hide`, that repetition landed in the shared PNG. The paper calendar it imitates names each place once.

**Do not add address matching here.** `lib/places.ts` groups on `event.place.id` and nothing else. Places are keyed server-side by the *normalized* address (migration `000014`, `model.NormalizeAddressKey`), so two events typed as `101 Main St, Saugus MA 01906` and `101 main street, saugus, massachusetts` already arrive with the same place id. All the fuzzy matching - abbreviations, ZIPs, diacritics, the `Ct` = Court vs Connecticut ambiguity - lives in one tested Go function. A second implementation in TypeScript would silently drift from it.

Two consequences worth knowing:

- **An event saved before `000014` has an address but no place.** It falls back to grouping on the trimmed lowercase address, so it still prints, but it will **not** merge into a resolved place at the same address - one key is a place id, the other is an address string. Printing both rows is the honest outcome and it fixes itself the moment the old event is saved.
- **The day and event title are gone from the row.** Both are already in the grid directly above. That removed the unambiguous click target, so a row is click-to-edit only when it stands for exactly one event; otherwise it shows an admin-only `×3` count (marked `data-export-hide`) explaining why it went quiet.

`hiddenFromPublic` on a group is true only when **no** event at that place is public. `address_public` is per event, but one row now stands for several, and if any one of them is public the address does appear on the public site.

Run `npm run test:places` - same Node built-in runner as the color tests.

The middleware in `frontend/proxy.ts` handles all locale detection. It checks (in order): the URL prefix, the `NEXT_LOCALE` cookie, and the `Accept-Language` header. The cookie persistence means once a visitor picks Vietnamese via the language switcher, they stay there on subsequent pageloads.

The switcher itself is `components/ui/LanguageSwitcher.tsx`, mounted in the Navbar's right cluster. See `docs/components.md` → "LanguageSwitcher" for design and responsive behavior.

Adding a new locale:
1. Add the code (e.g. `'es'`) to `locales` in `i18n/routing.ts`.
2. Create `messages/es.json` mirroring the English keys.
3. Add a system prompt row to Supabase `system_prompts` for the new locale (key like `es_translation`).
4. Add the code to the backend's `SUPPORTED_LOCALES` env var on Render.

---

## Data fetching

**Supabase is auth-only from the frontend's perspective.** All application data - posts, images, page content, calendar, reactions - is reached through the Go backend on Render. Internally the Go backend talks to Supabase Postgres (same Supabase project that handles auth, but a different surface), but the frontend must **never** call `supabase.from(...)` for app data; doing so bypasses the backend's validation, rate-limiting, and presigned-URL generation, and historically caused a split-brain outage. See `docs/agents/known-quirks.md` → "Posts created on production don't show up in the UI" for the canonical example.

### Two layers

- **`lib/api.ts`** - generic transport wrappers. Knows about `NEXT_PUBLIC_API_URL`, JSON encoding, Bearer-token headers, and `ApiError`. It does **not** know about any specific resource. Functions: `apiGet`, `apiGetCached`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`, `apiPostAnon`, `apiDeleteAnon`.
- **Resource services** (e.g. `lib/posts.ts`) - typed, resource-specific functions built on top of `lib/api.ts`. Components import these, **not** the generic wrappers, when working with a known resource. This way `/api/v1/posts` is referenced in exactly one file: when the URL or response shape changes you fix it once.

### `lib/posts.ts`

| Function | HTTP | When to use |
|---|---|---|
| `listPosts({ type?, limit? })` | `GET /posts` | Client components that must be fresh (admin dashboard) |
| `listPostsCached({ type?, limit? }, revalidate)` | `GET /posts` | Server-rendered public pages (homepage, events, announcements) |
| `getPost(id)` | `GET /posts/{id}` | Pre-filling the edit modal |
| `createPost(payload, token)` | `POST /posts` | `CreatePostForm` |
| `updatePost(id, payload, token)` | `PATCH /posts/{id}` | `EditPostForm` |
| `deletePost(id, token)` | `DELETE /posts/{id}` | `AdminControls` |
| `setPostArchived(id, archived, token)` | `PATCH /posts/{id}/archive` | `EventArchiveButton` |

```ts
// Server component - cached for 60s
import { listPostsCached } from '@/lib/posts'
const posts = await listPostsCached({ type: 'announcement' }, 60)

// Client component - always hits the network
import { listPosts } from '@/lib/posts'
const posts = await listPosts({ type: filter ?? undefined, limit: 100 })

// Admin write
import { createPost } from '@/lib/posts'
await createPost(payload, session.access_token)
```

### When to use raw `lib/api.ts`

For resources that don't yet have a service module (reactions, pages, gallery uploads), call the generic wrappers directly:

```ts
import { apiGet, apiPostAnon } from '@/lib/api'
const summary = await apiGet(`/api/v1/reactions/${postId}?fingerprint=${fp}`)
```

When a resource grows beyond two or three call sites, extract a `lib/<resource>.ts` service the same way `lib/posts.ts` works.

---

## Pages overview

| Page | Route | Data source |
|------|-------|-------------|
| Homepage | `/` | Go backend - `apiGetCached('/api/v1/posts?type=announcement&limit=3', 60)` + `apiGetCached('/api/v1/posts?type=event&limit=20', 60)`; events filtered/sorted client-side to the next 2 upcoming. **PRODUCT** hero (`#1C1210`, radial glow, bottom gradient rule, dual CTAs); Playfair + terracotta eyebrow/italic phrase; section `h2` Playfair 600. |
| Events | `/events` | Go backend - `apiGetCached('/api/v1/posts?type=event', 60)` |
| Announcements | `/announcements` | Go backend - `apiGetCached('/api/v1/posts?type=announcement', 60)` |
| Gallery | `/gallery` | Go backend - `GET /api/v1/posts?type=gallery_album` (response includes presigned `images[*].storage_url`) |
| Resources | `/resources` | Go backend - `GET /api/v1/posts?type=bible_study` and `?type=playlist` |
| About | `/about` | Go backend - `GET /api/v1/pages/about` (falls back to hardcoded defaults) |
| Connect | `/connect` | Go backend - `GET /api/v1/pages/connect` (falls back to hardcoded defaults) |
| Admin dashboard | `/admin` | Go backend - `apiGet('/api/v1/posts?limit=100')` (client component, requires Google login) |
| Admin editor | `/admin/[section]` | Go backend (POST/PATCH) |
| Page editor | `/admin/pages/[slug]` | Go backend - `GET` + `PUT /api/v1/pages/:slug` (admin only) |

---

## PostCard component
The "Facebook-style" card used everywhere. Props:
- `post` - full Post object (title, body, event_date, external_link, images, reactions)
- `showReactions` - boolean, defaults true (pass false in admin view)

Anatomy: date badge → title → body text → optional image(s) → optional link button → ReactionBar.

---

## Environment variables

For local development, `frontend/.env.local` (gitignored):
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...                              # safe to expose, RLS enforces permissions
NEXT_PUBLIC_API_URL=http://localhost:8080                      # local Go backend
```

For production, the same three vars live in **Vercel dashboard → Settings → Environment Variables** with the production values:
```
NEXT_PUBLIC_API_URL=https://church-website-ff5w.onrender.com   # Render-hosted Go backend
```

Never put the Supabase service role key in the frontend. Never.

---

## Admin page protection
The `/admin` route must check for a valid Supabase session AND verify the user's email exists in the `admins` table. If either check fails, redirect to homepage.
Check this in the page component using `supabase.auth.getSession()`, not middleware, to keep it simple.
