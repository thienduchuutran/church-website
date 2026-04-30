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

**Nav structure:** Home → News (desktop disclosure: click to open/close, `aria-expanded` / `aria-controls`, Escape and outside click close) → Calendar → Gallery → Resources → About. A separate **Connect** CTA sits to the right (next to Sign in).  
The `navItems` array is type-discriminated (`kind: 'link' | 'dropdown'`). Mobile menu is a single `<ul>` with `id="primary-mobile-nav"`, `hidden` when closed, `aria-expanded` / `aria-controls` on the menu button, and **min 44px** tap targets on primary controls. Desktop and mobile lists live inside one `<nav aria-label="Primary">` landmark. Route changes close open menus (`startTransition` to satisfy lint rules).  
**Chrome:** Sticky header uses **`bg-background/95`** (no backdrop blur) so the bar matches PRODUCT’s warm cream field instead of a glass effect.

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
Event date line uses a decorative calendar emoji with `aria-hidden` so screen readers read the formatted date only.  
**Visual system (PRODUCT):** **`rounded-[14px]`** and warm **`border-border`**; **no shadow at rest**, **`hover:shadow-[0_8px_28px_rgba(28,20,16,0.09)]`** only on hover. **Event** badges use **sage** (`accent`); **announcement** badges use **terracotta** (`primary`). Card titles use **`font-serif font-semibold`**.  
**Client component:** no (server component; `ReactionBar` inside is client)

---

#### `PostFeed`
Renders a vertical list of `PostCard` components with an empty-state fallback. Empty state uses **`rounded-[14px]`** dashed border to match card radius.

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

The post create/edit experience is split across four components plus a context provider, so each piece has a single responsibility:

- `PostFormFields` — presentational. Renders the inputs.
- `CreatePostForm` — owns state, calls `createPost`, redirects to the section route on success.
- `EditPostForm` — owns state initialized from a `Post`, calls `updatePost`, hands control back to its parent via `onSuccess` / `onCancel`.
- `EditPostModal` — modal chrome (backdrop, X button, Escape/click-out close) hosting `EditPostForm`. Rendered through a portal.
- `EditModalProvider` (in `lib/edit-modal.tsx`) — owns `editingId` state at the root layout; exposes `useEditModal()`.

#### `PostFormFields`
Pure presentational. Renders Title plus the conditional Body / Event Date / External Link inputs that apply to the given post type.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `section` | `string` (PostType) | required | Drives which inputs render — looked up via `POST_TYPE_FIELDS` in `lib/post-types.ts` |
| `state` | `PostFormState` | required | Controlled values for all inputs |
| `onChange` | `(next: PostFormState) => void` | required | Called with the next state on every keystroke |

**Client component:** yes (controlled inputs)
**No state, no API calls, no router** — safe to reuse from any caller.

---

#### `CreatePostForm`
Wraps `PostFormFields` with a `<form>`, error display, and submit/cancel buttons. Submits to `createPost` (in `lib/posts.ts`) and redirects to the section's public route on success.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `section` | `string` (PostType) | required | Determines payload `type`, button label, and post-success redirect |

**Client component:** yes
**Data flow:** form state → `toPostPayload(section, state)` → `createPost(payload, token)` → `router.push(POST_TYPE_ROUTES[section])`.

---

#### `EditPostForm`
Same shell as `CreatePostForm` but initializes state from an existing `Post` and submits via `updatePost`. It does **not** redirect — the parent decides via callbacks.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `post` | `Post` | required | Pre-fills all fields; `post.id` and `post.type` drive the PATCH path |
| `onSuccess` | `() => void` | required | Called after a successful save (modal closes, dashboard refetches) |
| `onCancel` | `() => void` | required | Called by the Cancel button |

**Client component:** yes
**Data flow:** `postToFormState(post)` → form state → `toPostPayload(post.type, state)` → `updatePost(post.id, payload, token)` → `router.refresh()` → `onSuccess()`.

---

#### `EditPostModal`
Renders the modal chrome around `EditPostForm`. Fetches the post by id, then hands the result to the form. Uses `createPortal(..., document.body)` because `PageTransition` applies a CSS transform that creates a containing block and would otherwise clip `position: fixed`.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | required | Post id — fetched via `getPost(id)` |
| `onClose` | `() => void` | required | Called by backdrop click, X button, Escape key, and the form's Cancel/Success callbacks |

**Client component:** yes
**Note:** This component is not used directly. `EditModalProvider` mounts it when `editingId` is set.

---

#### `AdminControls`
Per-post pencil + trash buttons rendered inside `PostCard`. Visible only to admins (`useAuth().isAdmin`).

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `postId` | `string` | required | Forwarded to `openEdit` and `deletePost` |

**Client component:** yes
**Data flow:**
- Edit click → `useEditModal().openEdit(postId)` → provider mounts `EditPostModal` with the id.
- Delete click → `confirm(...)` → `deletePost(postId, token)` → `router.refresh()`.

---

#### `AdminNav`
Navigation sidebar shown inside the admin layout.

**Props:** none  
**Client component:** yes (active-link highlighting)

---

### Page editor (`app/admin/pages/[slug]/page.tsx`)

Inline page component (not extracted to `components/`) that lets admins edit the About and Connect pages.

**Route:** `/admin/pages/[slug]` where `slug` is `about` or `connect`

**How it works**
1. On mount, fetches `GET /api/v1/pages/:slug` via `apiGet` to load existing section values.
2. Renders grouped form fields driven by a `PAGE_SCHEMA` constant — each page has named groups (Hero, Mission, etc.) with typed section keys.
3. On submit, sends `PUT /api/v1/pages/:slug` via `apiPut` with the admin's JWT.
4. Shows success/error feedback inline.

**Client component:** yes (form state, auth)

---

## Adding a new component — checklist

1. Place it in `components/ui/` (no business logic) or `components/features/<domain>/` (with logic).
2. Add `"use client"` only if the component uses hooks or browser APIs.
3. If the component calls the backend, use `lib/api.ts` helpers — never call `supabase` directly for reaction or fingerprint-scoped data.
4. **Update this file** (`docs/components.md`) with the component name, props table, and a brief description of its data flow.
5. Update `docs/agents/frontend.md` folder structure if the file is new.
