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
│           ├── pages/[slug]/page.tsx   ← Page content editor (about, connect)
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
│   │   ├── Modal.tsx
│   │   ├── Navbar.tsx
│   │   ├── PageTransition.tsx          ← Fade-in wrapper; used in layout.tsx
│   │   └── SocialIconBar.tsx           ← Social follow icons; reused in Navbar (desktop) + footer
│   └── features/                       ← Feature-specific, may contain business logic
│       ├── posts/
│       │   ├── PostCard.tsx            ← The "Facebook-style" post card
│       │   ├── PostFeed.tsx            ← List of PostCards
│       │   ├── PastEventsCarousel.tsx  ← Swipeable strip of past events (homepage + /events)
│       │   └── ReactionBar.tsx         ← 👍 ❤️ 🙏 😂 row on each card
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
│           └── PostFormFields.tsx       ← Presentational inputs shared by Create/Edit
│       └── assistant/
│           ├── ChatBox.tsx             ← Floating AI assistant widget
│           ├── ChatMessage.tsx         ← Renders user/assistant chat bubbles
│           └── TypingIndicator.tsx     ← Animated thinking indicator for the helper
├── lib/
│   ├── api.ts                          ← Generic fetch wrappers (apiGet/Post/Patch/Delete)
│   ├── auth.tsx                        ← Supabase auth context + useAuth hook
│   ├── calendar.ts                     ← Calendar API service (getMonth takes optional locale)
│   ├── discord.ts                      ← Discord link API (getDiscordStatus / getDiscordLinkUrl)
│   ├── events.ts                       ← partitionEvents/isUpcoming/canUnarchive (Upcoming vs Past sectioning)
│   ├── edit-modal.tsx                  ← EditModalProvider + useEditModal hook (in-place edit)
│   ├── pages.ts                        ← Page-content API service (typed { sections, machine_translated } response)
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

**Rule:** public read paths pass the locale they resolved via `getLocale()` (server) or `useLocale()` (client). Admin call sites (admin dashboard, edit modal, page editor) deliberately omit the locale so the form pre-fills with the English source - admins always work with the canonical text, never the translation.

`CalendarShell` reads `isAdmin` and only passes the locale when `!isAdmin` - same rule encoded in one component. When you add a new admin surface that calls `listPosts` or `getMonth`, follow the same pattern.

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
