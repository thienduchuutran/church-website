# Component Reference

All components live under `frontend/components/`.  
Convention: one component per file, filename = component name (PascalCase).  
Add `"use client"` only when the component needs `useState`, `useEffect`, event handlers, or browser APIs.

---

## UI primitives (`components/ui/`)

Reusable, stateless building blocks. No business logic or API calls.

### `Navbar`
Site-wide navigation bar. Includes mobile hamburger menu.  
**Props:** none (reads session state internally for login/logout button)  
**Client component:** yes (session state, mobile menu toggle)

**Nav structure:** Home → News (hover dropdown: Events, Announcements) → Gallery → Resources.  
The `navItems` array is type-discriminated (`kind: 'link' | 'dropdown'`). Desktop dropdown uses CSS `group-hover` — no extra state. Mobile renders dropdown children as indented sub-items. The "News" parent is highlighted whenever `pathname` matches any child route.

---

### `PageTransition`
Wraps page content and replays a CSS fade-in animation on every route change.  
**Props:** `children: React.ReactNode`  
**Client component:** yes (`usePathname` to detect navigation)  
**How it works:** passes `key={pathname}` to a wrapping `div` — when the key changes React unmounts and remounts the element, which restarts the `.animate-page-fade-in` CSS animation defined in `globals.css`. Used once in `layout.tsx`; all pages get the effect automatically.

---

## Feature components (`components/features/`)

May contain business logic, API calls, and local state.

---

### Posts (`components/features/posts/`)

#### `PostCard`
Facebook-style card rendered for every post.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `post` | `Post` | required | Full post object including images and reaction counts |
| `showReactions` | `boolean` | `true` | Pass `false` in admin views to hide the reaction bar |

**Anatomy** (top to bottom): date badge → title → body text → optional image(s) → optional external link button → `ReactionBar`  
**Client component:** no (server component; `ReactionBar` inside is client)

---

#### `PostFeed`
Renders a vertical list of `PostCard` components with an empty-state fallback.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `posts` | `Post[]` | required | Array of posts to render |
| `showReactions` | `boolean` | `true` | Forwarded to each `PostCard` |

**Client component:** no

---

#### `ReactionBar`
Anonymous emoji reaction picker shown at the bottom of each `PostCard`.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `postId` | `string` | required | UUID of the post |
| `showReactions` | `boolean` | `true` | When `false`, renders nothing |

**How it works**
1. On mount, calls `GET /api/v1/reactions/{postId}?fingerprint={fp}` via `apiGet` — one round-trip returns both the per-emoji counts and this browser's existing reaction.
2. Fingerprint is a random UUID stored in `localStorage` under `church_reaction_fp`. Generated once per browser, never sent to the backend on reads unless the user has interacted.
3. Writes go through `apiPostAnon` (upsert) and `apiDeleteAnon` (remove), both hitting the Go backend — never Supabase directly.
4. State updates are optimistic: counts and `myReaction` update immediately, with a `pending` lock to prevent double-submit.

**Allowed emojis:** `👍` `❤️` `🙏` `😂`  
**Client component:** yes

**Data flow**
```
mount → apiGet /api/v1/reactions/{postId}?fingerprint={fp}
                    ↓
          { counts, my_reaction }
                    ↓
          setCounts / setMyReaction

click emoji → apiPostAnon /api/v1/reactions  (upsert)
           or apiDeleteAnon /api/v1/reactions/{postId}  (remove)
```

> **Architecture rule:** `ReactionBar` must never import or call `supabase` directly.  
> All reads and writes go through `lib/api.ts` → Go backend → Postgres.

---

### Gallery (`components/features/gallery/`)

#### `AlbumGrid`
Grid of gallery album cards, each linking to the album detail.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `albums` | `Post[]` | required | Posts of type `gallery_album` |

**Client component:** no

---

#### `RecentMoments`
Flat photo grid showing the most recent images across all albums.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `images` | `PostImage[]` | required | Flat array of images |

**Client component:** no

---

### Admin (`components/features/admin/`)

#### `AdminPostForm`
Create/edit form for posts. Submits via `apiPost` / `apiPatch` with the admin's JWT.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `section` | `PostType` | required | Determines which fields are shown |
| `existingPost` | `Post \| null` | `null` | When set, form is in edit mode |

**Client component:** yes

---

#### `AdminNav`
Navigation sidebar shown inside the admin layout.

**Props:** none  
**Client component:** yes (active-link highlighting)

---

## Adding a new component — checklist

1. Place it in `components/ui/` (no business logic) or `components/features/<domain>/` (with logic).
2. Add `"use client"` only if the component uses hooks or browser APIs.
3. If the component calls the backend, use `lib/api.ts` helpers — never call `supabase` directly for reaction or fingerprint-scoped data.
4. **Update this file** (`docs/components.md`) with the component name, props table, and a brief description of its data flow.
5. Update `docs/agents/frontend.md` folder structure if the file is new.
