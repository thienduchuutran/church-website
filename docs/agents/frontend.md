# docs/agents/frontend.md — Next.js Frontend Reference

## Framework
Next.js with the App Router (`/app` directory). React Server Components where possible, client components only when interactivity requires it.

## Styling
Tailwind CSS. No inline styles. No separate CSS files unless absolutely necessary.

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
│   └── admin/
│       ├── page.tsx                    ← Admin dashboard (lists all posts, edit/delete)
│       └── [section]/page.tsx          ← Post creation form per section
├── components/
│   ├── ui/                             ← Reusable primitives, no business logic
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   └── Navbar.tsx
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

**Public reads — simple list/detail data (posts, images):** May fetch directly from Supabase using the anon key when there is no business logic involved and no per-user context is required.

```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

**Public reads that require per-user context (e.g. reactions by fingerprint):** Must go through the Go backend via `lib/api.ts → apiGet(...)`. Never query Supabase directly for fingerprint-scoped or business-logic-bearing reads — doing so bypasses the service layer and couples the UI to the DB schema.

**Admin writes (create/edit/delete):** Always go through the Go backend via `lib/api.ts`. The frontend attaches the Supabase JWT to the Authorization header.

```ts
// lib/api.ts
export async function apiPost(path: string, body: unknown, session: { access_token: string }) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
```

---

## Pages overview

| Page | Route | Data source |
|------|-------|-------------|
| Homepage | `/` | Supabase — latest 3 announcements + next 2 events |
| Events | `/events` | Supabase — all posts where type = 'event', newest first |
| Announcements | `/announcements` | Supabase — all posts where type = 'announcement' |
| Gallery | `/gallery` | Supabase — all gallery_album posts + their images |
| Resources | `/resources` | Supabase — bible_study + playlist posts |
| Admin dashboard | `/admin` | Supabase — all posts (requires Google login) |
| Admin editor | `/admin/[section]` | Go backend (POST/PATCH) |

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
