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
│   ├── page.jsx                        ← Homepage
│   ├── events/page.jsx
│   ├── announcements/page.jsx
│   ├── gallery/page.jsx
│   ├── resources/page.jsx
│   └── admin/
│       ├── page.jsx                    ← Admin dashboard (lists all posts, edit/delete)
│       └── [section]/page.jsx          ← Post creation form per section
├── components/
│   ├── ui/                             ← Reusable primitives, no business logic
│   │   ├── Button.jsx
│   │   ├── Input.jsx
│   │   ├── Modal.jsx
│   │   └── Navbar.jsx
│   └── features/                       ← Feature-specific, may contain business logic
│       ├── posts/
│       │   ├── PostCard.jsx            ← The "Facebook-style" post card
│       │   ├── PostFeed.jsx            ← List of PostCards
│       │   └── ReactionBar.jsx         ← 👍 ❤️ 🙏 😂 row on each card
│       ├── gallery/
│       │   ├── AlbumGrid.jsx           ← Grid of albums
│       │   └── RecentMoments.jsx       ← Flat photo grid
│       └── admin/
│           ├── AdminPostForm.jsx        ← Create/edit post form
│           └── AdminNav.jsx
├── lib/
│   ├── supabase.js                     ← Supabase client (auth + direct public reads)
│   └── api.js                          ← Fetch wrapper for Go backend calls
├── public/
├── .env.local
└── next.config.js
```

---

## Component conventions

- **Server Component by default.** Only add `"use client"` at the top when the component needs `useState`, `useEffect`, event handlers, or browser APIs.
- **One component per file.** File name = component name, PascalCase.
- **Props** should be destructured in the function signature.
- **No prop drilling beyond 2 levels.** If a value is needed 3+ levels deep, use React Context or fetch it at the point of use.

---

## Data fetching

**Public reads (viewer pages):** Fetch directly from Supabase using the anon key. No need to go through the Go backend for reads.

```js
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
```

**Admin writes (create/edit/delete):** Always go through the Go backend via `lib/api.js`. The frontend attaches the Supabase JWT to the Authorization header.

```js
// lib/api.js
export async function apiPost(path, body, session) {
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
