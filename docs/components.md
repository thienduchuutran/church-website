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
**How it works:** passes `key={pathname}` to a wrapping `div` - when the key changes React unmounts and remounts the element, which restarts the `.animate-page-fade-in` CSS animation defined in `globals.css`. Used once in `layout.tsx`; all pages get the effect automatically.

---

### `SocialIconBar`
Renders the church's social media follow icons (YouTube, Facebook, Instagram) in strategic priority order. Single source of truth lives in `lib/social.ts`; placement consistency is guaranteed by reusing this component in both the navbar and the footer.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'header' \| 'footer'` | `'footer'` | `header` uses 20px icons with tight spacing for the navbar; `footer` uses 24px icons with more breathing room |
| `className` | `string` | `''` | Optional extra classes applied to the outer `<nav>` for layout control |

**Behavior:**
- Each link opens in a new tab with `rel="noopener noreferrer"` (prevents `window.opener` tab-hijack).
- 44x44 outer hit area on every link to satisfy WCAG 2.1 touch target.
- Default color is `text-muted` (monochrome at rest, matches body chrome); hover/focus transitions to the platform's brand color via a per-link `--brand-color` CSS variable.
- Wrapped in `<nav aria-label="Social media">` so assistive tech treats it as a distinct landmark.

**Placement:**
- Navbar (desktop + mobile) - sits just before the hamburger on mobile and just before the Connect CTA on desktop, separated by a right border. The mobile placement is a deliberate trade: a small amount of thumb-zone friction in exchange for constant legitimacy signaling, which a pre-launch church benefits from more than a conversion funnel would.
- Layout footer (desktop + mobile) - centered above the copyright line; the primary "follow us" surface.

**Editing URLs:** Update `frontend/lib/social.ts` only. To remove a platform, delete its entry from `SOCIAL_LINKS`. Do not include an icon for an inactive account - a link to a dormant profile damages credibility.

**Client component:** no (pure server component, no state or browser APIs)

---

### `LanguageSwitcher`
Switches between English and Vietnamese without page reload. Lives in the Navbar's right cluster, just left of `SocialIconBar`.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Extra classes appended to the outer pill group |

**Behavior:**
- Reads the active locale via `useLocale()` from `next-intl`.
- On click, calls `router.replace(pathname, { locale: target })` from `@/i18n/routing` - the locale-aware router automatically strips/adds the prefix so the user stays on the equivalent path in the new language (e.g. `/vi/events` ↔ `/events`).
- next-intl middleware writes the new value into the `NEXT_LOCALE` cookie on the response, so the choice persists across visits.
- Wraps the navigation in `useTransition`; the inactive button dims (`opacity-60`) while the route is committing.

**Responsive form:**
- **Desktop (`md+`):** both `EN` and `VI` pills visible. The active one carries `bg-primary/10 text-primary`; the inactive shows `text-muted`. Standard A/B toggle pattern.
- **Mobile (below `md`):** only the **inactive** pill is visible - it acts as a single "switch to X" button. Reasoning: the navbar right cluster already carries logo, social icons, and hamburger (~240px). Adding two 44px pills would overflow on iPhone-SE-class widths (343px content). Hiding the active pill keeps the WCAG-compliant 44x44 tap target while saving 46px.

**Accessibility:**
- Each button has `aria-pressed` set to the active state.
- `aria-label="Switch to <full language name>"` from the `Language.switchTo` message key.
- `title` tooltip with the localized language name.
- The outer `<div role="group" aria-label="Language">` (`Language.label` message key) groups the toggle for screen readers.

**Message keys (in `messages/{en,vi}.json`):**
```json
"Language": {
  "label": "Language",
  "en": "English",
  "vi": "Vietnamese",
  "switchTo": "Switch to {language}"
}
```

**Client component:** yes (uses `useTransition`, `useLocale`, locale-aware `useRouter`/`usePathname`).

---

### `MachineTranslatedBadge`
Small italic "Bản dịch tự động" notice that flags content served from an unapproved AI translation. Lives at the bottom of post cards, beside calendar event titles inside `DayEventsModal`, under the month note on the calendar shell, and below the page hero on About/Connect.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Extra classes appended to the `<span>` for layout (e.g. `mt-2` when stacking under other content) |

**Design tokens (from Phase 4 spec):**
- Color: terracotta `#C4663C` via inline style (so the badge keeps its brand color even if a parent surface uses a different palette).
- Font size: `10px` (`text-[10px]`) - deliberately quiet.
- `italic` - softens the visual weight further.
- Text: read from `Common.machineTranslated` in the active locale's messages JSON.

**Render guard.** Callers must wrap the badge in `{record.machine_translated && <MachineTranslatedBadge />}`. The Go backend omits the field on English responses and on human-approved translations, so the badge correctly disappears for both - but never render unconditionally.

**Where it appears:**
- `PostCard` - bottom-right of the action row, below `ReactionBar`.
- `DayEventsModal` - per-event, beneath each event's notes (when present).
- `CalendarShell` - under the month note text.
- `app/[locale]/about/page.tsx`, `app/[locale]/connect/page.tsx` - centered under the hero subtitle, since the page itself is the unit (no per-section cards).

**Client component:** no - reads translations via `useTranslations('Common')` from `next-intl`, which works in server components when the page tree includes `NextIntlClientProvider`. The badge is a pure presentational server component.

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
Event date line uses a decorative calendar emoji with `aria-hidden` so screen readers read the formatted date only. Event cards with no `event_date` show a muted "📅 Date TBD" chip in place of a date; admins also see an `EventArchiveButton` in the header to move the event between the Upcoming and Past sections.  
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

#### `PastEventsCarousel`
Horizontally swipeable strip of past events, rendered below the Upcoming feed on the homepage and `/events`. Each slide is a **full-width `PostCard`** - identical to the cards in the vertical feeds - so the section reads like the normal feed except you swipe sideways between past events instead of scrolling down. Uses native CSS scroll-snap (no JS carousel), one card snapping into view at a time. The parent hides the whole section when the list is empty, so this component renders no empty state.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `posts` | `Post[]` | required | Past events to render as slides (already sorted by the parent via `partitionEvents`) |

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
1. On mount, calls `GET /api/v1/reactions/{postId}?fingerprint={fp}` via `apiGet` - one round-trip returns both the per-emoji counts and this browser's existing reaction.
2. Fingerprint is a random UUID stored in `localStorage` under `church_reaction_fp`. Generated once per browser, never sent to the backend on reads unless the user has interacted.
3. Writes go through `apiPostAnon` (upsert) and `apiDeleteAnon` (remove), both hitting the Go backend - never Supabase directly.
4. State updates are optimistic: counts and `myReaction` update immediately, with a `pending` lock to prevent double-submit.

**Picker gesture (Facebook-style)**
The picker bar is opened by two paths, unified through Pointer Events so we don't fork mouse vs touch code:
- **Desktop (mouse):** hover over the trigger opens the picker. Gated on `pointerType === 'mouse'` so touch-emitted synthetic hovers don't trigger it.
- **Mobile (touch / pen):** a 350ms long-press on the trigger opens the picker with a light haptic (`navigator.vibrate(12)`). If the finger moves > 10px before the timer fires it counts as a scroll and the long-press is cancelled. Once open, `setPointerCapture` keeps move/up events flowing while the finger drags up onto the picker bar, and `document.elementFromPoint` is used in `onPointerMove` to find which emoji is under the finger - that one scales up and lifts via `-translate-y-2 scale-150` for a live preview. Releasing over an emoji selects it; releasing off the bar leaves it open for tap-pick. The post-long-press synthetic click is swallowed via a `longPressFiredRef` flag so the default Like doesn't double-fire.
- **Short tap:** falls through to `handleTriggerClick`, which toggles the current reaction (default 👍).
- **Dismissal:** `pointerdown` outside the container or any window `scroll` closes the picker. iOS callout suppression (`-webkit-touch-callout`, `user-select: none`, `WebkitTapHighlightColor: transparent`, `touch-action: manipulation` on trigger, `touch-action: none` on the picker bar) prevents the long-press from triggering the iOS "copy/look up" menu or accidental page panning during drag. Emoji buttons are 44px on mobile (`h-11 w-11`) and 36px on desktop (`sm:h-9 sm:w-9`).

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

### `TranslationReviewItem`
Two-column side-by-side diff card for the `/admin/translations` review panel. English source on the left (read-only), Vietnamese translation on the right (editable textarea). Three action buttons: Approve as-is, Save edits, Re-translate.

**Props**
| Prop | Type | Description |
|------|------|-------------|
| `item` | `AdminTranslation` | The translation row from `GET /api/v1/admin/translations`, including the synthesized `record_title` |
| `onChange` | `() => void` | Called after a successful approve / retranslate so the parent list refreshes |
| `onApprove` | `(id, translatedText \| null) => Promise<void>` | Approve handler. Pass null for "approve as-is", a string for "save edits". |
| `onRetranslate` | `(id) => Promise<void>` | Retranslate handler. The component shows a `window.confirm` before calling - this is destructive (deletes the row + re-enqueues) |

**Design tokens:**
- Approve as-is: `bg-primary` (terracotta `#C4663C`), white text - primary CTA
- Save edits: sage `#4A7A5C` background, white text - only colored when `hasEdits === true`, otherwise muted disabled state
- Re-translate: ghost (transparent, `text-muted`, hover bg) - secondary destructive action

**State:**
- `text` - controlled textarea, seeded from `item.translated_text`
- `hasEdits` - computed: `text !== item.translated_text`, drives Save button enable state
- `submitting` - one of `null | 'approve' | 'save' | 'retranslate'` so each button can show its own "…ing" label

**Table label badges** (color-coded per `table_name`):
- `posts` → "Post" (terracotta tint)
- `page_content` → "Page" (amber tint)
- `calendar_events` → "Event" (accent tint)
- `calendar_month_notes` → "Month note" (emerald tint)
- unknown → raw `table_name` (muted)

**Client component:** yes (textarea state, async submit, window.confirm).

---

### Admin (`components/features/admin/`)

The post create/edit experience is split across four components plus a context provider, so each piece has a single responsibility:

- `PostFormFields` - presentational. Renders the inputs.
- `CreatePostForm` - owns state, calls `createPost`, redirects to the section route on success.
- `EditPostForm` - owns state initialized from a `Post`, calls `updatePost`, hands control back to its parent via `onSuccess` / `onCancel`.
- `EditPostModal` - modal chrome (backdrop, X button, Escape/click-out close) hosting `EditPostForm`. Rendered through a portal.
- `EditModalProvider` (in `lib/edit-modal.tsx`) - owns `editingId` state at the root layout; exposes `useEditModal()`.

#### `PostFormFields`
Pure presentational. Renders Title plus the conditional Body / Event Date / External Link inputs that apply to the given post type.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `section` | `string` (PostType) | required | Drives which inputs render - looked up via `POST_TYPE_FIELDS` in `lib/post-types.ts` |
| `state` | `PostFormState` | required | Controlled values for all inputs |
| `onChange` | `(next: PostFormState) => void` | required | Called with the next state on every keystroke |
| `postId` | `string \| undefined` | required | Edit mode when set, create mode when undefined. Gates the gallery `TagSelector` and the create-only `DiscordComposerNote` |

**Client component:** yes (controlled inputs)
**No state or API calls of its own.** In create mode it renders `DiscordComposerNote` (which fetches Discord link status); otherwise still safe to reuse from any caller.

---

#### `DiscordComposerNote`
Shown under the form **only when creating** (`!postId`). Tells the admin which Discord channel the post will go to and under whose identity, and exposes the "Notify @everyone" opt-in. Self-contained: fetches the admin's link status so `PostFormFields` stays presentational.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `section` | `string` (PostType) | required | Looked up in `POST_TYPE_DISCORD_CHANNELS`; renders nothing for an unmapped type |
| `notifyEveryone` | `boolean` | required | Controlled checkbox value (bound to `PostFormState.notifyEveryone`) |
| `onNotifyChange` | `(next: boolean) => void` | required | Toggles the @everyone opt-in |

**Client component:** yes
**Data flow:** `getDiscordStatus(token)` (from `lib/discord.ts`) → "post to #channel as &lt;name&gt;" or a "Link your Discord" nudge linking to `/admin`.

---

#### `DiscordLinkCard`
Dashboard card (mounted on `/admin`) for the one-time Discord account link. Shows the linked identity (avatar + name) once connected, or a "Link my Discord" button that fetches the OAuth URL and redirects the browser. Reads `?discord=linked|error` (set by the callback redirect) to show a success/error banner; surfaces a friendly message when the server returns `503` (Discord linking not configured).

**Props:** none.
**Client component:** yes (uses `useSearchParams` - mounted inside a `<Suspense>` boundary on the admin page).
**Data flow:** `getDiscordStatus(token)` on mount; `getDiscordLinkUrl(token)` → `window.location` on click.

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
Same shell as `CreatePostForm` but initializes state from an existing `Post` and submits via `updatePost`. It does **not** redirect - the parent decides via callbacks.

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
| `id` | `string` | required | Post id - fetched via `getPost(id)` |
| `onClose` | `() => void` | required | Called by backdrop click, X button, Escape key, and the form's Cancel/Success callbacks - fired *after* the exit animation completes |

**Client component:** yes
**Visual system:** Apple-style sheet - blurred + saturated backdrop (`backdrop-blur-xl backdrop-saturate-150`), `rounded-3xl`, layered soft shadow with a hairline `ring-1 ring-black/5`. Entry animates `scale(0.94) translateY(20px) → 1` over 480ms with `cubic-bezier(0.32, 0.72, 0, 1)` (iOS "snappy" decel curve); exit is faster (240ms) with an accel curve, per Apple HIG. Animation classes (`apple-backdrop-in/out`, `apple-sheet-in/out`) live in `globals.css` and collapse to no-op under `prefers-reduced-motion`. Internal `closing` state delays the parent's `onClose` by `EXIT_MS` so the exit animation has time to play.
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

#### `EventArchiveButton`
Admin-only button rendered in the `PostCard` header for `event` posts. Moves the event between the Upcoming and Past sections via `setPostArchived`. Shows "Move to Past" when the event is Upcoming, "Move to Upcoming" when it can be returned (`canUnarchive` in `lib/events.ts`), and renders nothing when neither applies (e.g. an event already past by date - clearing the flag wouldn't move it).

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `post` | `Post` | required | Needs the full post to read `archived_at` + `event_date` for the direction decision |

**Client component:** yes  
**Data flow:** click → `setPostArchived(post.id, toPast, token)` → `router.refresh()` + `useEditModal().notifyChanged()`.

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
2. Renders grouped form fields driven by a `PAGE_SCHEMA` constant - each page has named groups (Hero, Mission, etc.) with typed section keys.
3. On submit, sends `PUT /api/v1/pages/:slug` via `apiPut` with the admin's JWT.
4. Shows success/error feedback inline.

**Client component:** yes (form state, auth)

---

## `AccentColorPicker`
Inline contextual popover that lets an admin pick the accent color for the currently-viewed calendar month.

**File:** `components/features/calendar/AccentColorPicker.tsx`

**Props**
| Prop | Type | Description |
|------|------|-------------|
| `monthLabel` | `string` | "May 2026" - shown in the popover heading |
| `currentAccent` | `string` | Saved (or default) hex used to revert the live preview when the user cancels |
| `onPreview` | `(hex: string) => void` | Pushes a hex up to `CalendarShell` for instant preview as the user clicks swatches or moves the native color input |
| `onSave` | `(hex: string) => Promise<void>` | Persists the choice; rejection surfaces the inline "Couldn't save, try again" message |
| `onClose` | `() => void` | Asks the parent to unmount the popover |
| `saving` | `boolean` | Disables buttons + shows the "Saving…" label on the save button |

**Data flow**
1. Mounted by `CalendarShell` only when `isAdmin` is true and the user clicked the "Accent color" trigger.
2. Internal `picked` state mirrors what the user has selected. Every swatch click and color-input change calls `onPreview(picked)`, which the shell uses to render an ephemeral preview without touching `monthSettings`.
3. Save calls `onSave(picked)`, which the shell wires to `PUT /api/v1/calendar/months/:year/:month/settings`.
4. Cancel / outside click / Escape revert the preview to `currentAccent` and close the popover.

**Client component:** yes (state, keyboard + outside-click effects)

---

### Assistant (`components/features/assistant/`)

#### `ChatBox`
Floating AI assistant widget for the church website, appearing as a FAB in the bottom-right corner.

**Props:** none  
**Client component:** yes (state, conversation history, FAB toggling, scrolling effects)  
**How it works**
1. When clicked, opens a floating 380x520px dialog with an intro card.
2. Offers four quick-question chips when empty. Clicking one sends that question immediately.
3. Submits queries via `chatWithAssistant` from `lib/assistant.ts`.
4. Saves full message entries with their citation sources to render inline.
5. Employs typing indicators and handles network/rate-limit errors gracefully.

---

#### `ChatMessage`
A single message bubble in the AI assistant conversation list.

**Props**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `role` | `'user' \| 'assistant'` | required | Message sender role |
| `content` | `string` | required | Text content from the user or assistant |
| `sources` | `AssistantSource[]` | optional | Citation source references returned by the RAG backend |

**Visuals:** User bubbles are primary (terracotta) aligned right. Assistant bubbles are surface-toned with a border, aligned left. Renders markdown-lite bold formatting (`**text**`) and safely escapes HTML to prevent XSS. Sources are rendered as labeled chips with icons.  
**Client component:** yes

---

#### `TypingIndicator`
Three-dot staggered bouncing typing indicator for the assistant thinking state.

**Props:** none  
**Client component:** yes

---

## Adding a new component - checklist

1. Place it in `components/ui/` (no business logic) or `components/features/<domain>/` (with logic).
2. Add `"use client"` only if the component uses hooks or browser APIs.
3. If the component calls the backend, use `lib/api.ts` helpers - never call `supabase` directly for reaction or fingerprint-scoped data.
4. **Update this file** (`docs/components.md`) with the component name, props table, and a brief description of its data flow.
5. Update `docs/agents/frontend.md` folder structure if the file is new.
