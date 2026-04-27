# docs/agents/frontend.md — Next.js Frontend Reference

## Framework
Next.js with the App Router (`/app` directory). React Server Components where possible, client components only when interactivity requires it.

## Styling
Tailwind CSS. No inline styles. No separate CSS files unless absolutely necessary.

**Design tokens and voice:** See repo-root **`DESIGN.md`** (human + machine-readable frontmatter) and **`DESIGN.json`** (sidecar: shadows, motion, component snippets). Canonical CSS variables live in **`frontend/app/globals.css`** (`:root` and dark `prefers-color-scheme` overrides).

---

## Folder structure
```
frontend/
├── app/
│   ├── layout.tsx                      ← Root layout (required by App Router)
│   ├── globals.css                     ← Tailwind CSS entry point
│   ├── page.tsx                        ← Homepage
│   ├── events/page.tsx
│   ├── announcements/page.tsx
│   ├── gallery/page.tsx
│   ├── resources/page.tsx
│   ├── about/page.tsx                  ← Fetches from GET /api/v1/pages/about; falls back to defaults
│   ├── connect/page.tsx                ← Fetches from GET /api/v1/pages/connect; falls back to defaults
│   └── admin/
│       ├── page.tsx                    ← Admin dashboard (lists all posts, edit/delete, edit pages)
│       ├── [section]/page.tsx          ← Post creation form per section
│       └── pages/[slug]/page.tsx       ← Page content editor (about, connect)
├── components/
│   ├── ui/                             ← Reusable primitives, no business logic
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Navbar.tsx
│   │   └── PageTransition.tsx          ← Fade-in wrapper; used in layout.tsx
│   └── features/                       ← Feature-specific, may contain business logic
│       ├── posts/
│       │   ├── PostCard.tsx            ← The "Facebook-style" post card
│       │   ├── PostFeed.tsx            ← List of PostCards
│       │   └── ReactionBar.tsx         ← 👍 ❤️ 🙏 😂 row on each card
│       ├── gallery/
│       │   ├── AlbumGrid.tsx           ← Grid of albums
│       │   └── RecentMoments.tsx       ← Flat photo grid
│       └── admin/
│           ├── AdminPostForm.tsx        ← Create/edit post form
│           └── AdminNav.tsx
├── lib/
│   ├── supabase.ts                     ← Supabase client (auth + direct public reads)
│   └── api.ts                          ← Fetch wrapper for Go backend calls
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

## Data fetching

**Supabase is auth-only.** All application data — posts, images, page content, calendar, reactions — lives in AWS RDS and is reached through the Go backend. The frontend must **never** call `supabase.from(...)` for app data; doing so reads from the wrong database (the legacy Supabase Postgres) and creates a split-brain where writes and reads disagree. See `docs/agents/known-quirks.md` → "Posts created on production don't show up in the UI" for the original outage this caused.

**Public reads:** Use `apiGet(path)` for client-side fetches that must be fresh (e.g. reactions, the admin dashboard) and `apiGetCached(path, revalidate)` for server-rendered routes that should be cached for `revalidate` seconds.

```ts
// Server component — cached for 60s by Next.js
import { apiGetCached } from '@/lib/api'
const posts = await apiGetCached('/api/v1/posts?type=announcement', 60)

// Client component — always hits the network
import { apiGet } from '@/lib/api'
const summary = await apiGet(`/api/v1/reactions/${postId}?fingerprint=${fp}`)
```

**Admin writes (create/edit/delete):** Always go through the Go backend via `lib/api.ts`. The frontend attaches the Supabase JWT to the Authorization header.

```ts
// lib/api.ts
export async function apiPost(path: string, body: unknown, accessToken: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
```

---

## Pages overview

| Page | Route | Data source |
|------|-------|-------------|
| Homepage | `/` | Go backend — `apiGetCached('/api/v1/posts?type=announcement&limit=3', 60)` + `apiGetCached('/api/v1/posts?type=event&limit=20', 60)`; events filtered/sorted client-side to the next 2 upcoming. **PRODUCT** hero (`#1C1210`, radial glow, bottom gradient rule, dual CTAs); Playfair + terracotta eyebrow/italic phrase; section `h2` Playfair 600. |
| Events | `/events` | Go backend — `apiGetCached('/api/v1/posts?type=event', 60)` |
| Announcements | `/announcements` | Go backend — `apiGetCached('/api/v1/posts?type=announcement', 60)` |
| Gallery | `/gallery` | Go backend — `GET /api/v1/posts?type=gallery_album` (response includes presigned `images[*].storage_url`) |
| Resources | `/resources` | Go backend — `GET /api/v1/posts?type=bible_study` and `?type=playlist` |
| About | `/about` | Go backend — `GET /api/v1/pages/about` (falls back to hardcoded defaults) |
| Connect | `/connect` | Go backend — `GET /api/v1/pages/connect` (falls back to hardcoded defaults) |
| Admin dashboard | `/admin` | Go backend — `apiGet('/api/v1/posts?limit=100')` (client component, requires Google login) |
| Admin editor | `/admin/[section]` | Go backend (POST/PATCH) |
| Page editor | `/admin/pages/[slug]` | Go backend — `GET` + `PUT /api/v1/pages/:slug` (admin only) |

---

## PostCard component
The "Facebook-style" card used everywhere. Props:
- `post` — full Post object (title, body, event_date, external_link, images, reactions)
- `showReactions` — boolean, defaults true (pass false in admin view)

Anatomy: date badge → title → body text → optional image(s) → optional link button → ReactionBar.

---

## Environment variables (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...          # safe to expose, RLS enforces permissions
NEXT_PUBLIC_API_URL=http://localhost:8080  # Go backend URL (prod: https://your-app.fly.dev)
```
Never put the Supabase service role key in the frontend. Never.

---

## Admin page protection
The `/admin` route must check for a valid Supabase session AND verify the user's email exists in the `admins` table. If either check fails, redirect to homepage.
Check this in the page component using `supabase.auth.getSession()`, not middleware, to keep it simple.
