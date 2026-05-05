# progress.md - System Growth & Resume Notes

## Project Context
church-website: a Next.js frontend + Go backend + Supabase data/auth/storage app for church management.

## 2026-04-27 - `$impeccable document` (DESIGN.md + DESIGN.json)

1. Added repo-root **`DESIGN.md`** (Stitch-style YAML frontmatter + six body sections: Overview, Colors, Typography, Elevation, Components, Do's and Don'ts) extracted from **`frontend/app/globals.css`**, home hero in **`app/page.tsx`**, **`PostCard`**, **`Navbar`**, aligned with **PRODUCT.md** guardrails.
2. Added **`DESIGN.json`** sidecar (`schemaVersion` 2): tonal hints, shadow/motion/breakpoint extensions, three self-contained **`ds-*`** CSS snippets for panel preview, narrative mirror of rules and do/don't lists.
3. Ran **`load-context.mjs`** so future impeccable runs see **`hasDesign: true`**.

## 2026-04-27 - `$impeccable craft home` (PRODUCT palette + hero)

1. **`globals.css`:** Replaced navy-first tokens with **PRODUCT** values: cream **`#faf7f2`**, ink **`#1c1a18`**, **terracotta** primary **`#c4663c`**, **sage** accent **`#4a7a5c`**, warm **`#eae5de`** borders, warm off-white **`#fffefb`** surfaces; dark mode uses **warm charcoal** (no blue primary). Page fade uses **cubic-bezier(0.22, 1, 0.36, 1)** (ease-out style).
2. **`app/page.tsx`:** Hero is **`#1C1210`** with **radial terracotta glow**, **bottom gold–terracotta rule** at 40% opacity, **no photo**; eyebrow, Playfair **`h1`**, body line, and **two CTAs** (terracotta fill + ghost outline). Error alert **no drop shadow**; **`rounded-[14px]`** on alert.
3. **`Navbar`:** Header **`bg-background/95`**, backdrop blur removed (PRODUCT / impeccable glass ban).
4. **`PostCard` / `PostFeed`:** Warm badges, **14px** radius, **shadow only on hover**; titles **Playfair 600**.
5. **`layout.tsx`:** Metadata title/description aligned with ministry name.

## 2026-04-27 - Home layout (`arrange` / layout rhythm)

1. **Hero:** fluid vertical padding via **`clamp`**, inner **`max-w-[min(100%,40rem)]`** so type does not spray edge-to-edge on wide screens; slightly looser **margin** above the description.
2. **Below hero:** **asymmetric vertical rhythm** (tighter **pt** on `sm`, roomier on **`lg`**) instead of a single **`py-12`**; **error alert** gets **more bottom margin** when present.
3. **Sections:** **title row → feed** uses **`mb-4`** (tight grouping); **announcements vs events** separated by **`mt-16 sm:mt-20 lg:mt-24`** instead of uniform **`space-y-12`**.
4. **Section headers:** **`items-baseline`**, **`gap-x-6 gap-y-3`**, **`h2` with `flex-1`**; **“View all”** uses **`self-end` on small screens** when the row wraps so the control stays visually anchored.

## 2026-04-27 - Home typography (`typeset` / PRODUCT scale)

1. **Playfair_Display** in `layout.tsx` now loads weight **600** for section-level serif headings.
2. **`app/page.tsx` hero:** eyebrow label (uppercase, terracotta, letter-spacing per PRODUCT), **Playfair** display `h1` with fluid **`clamp(2.25rem, 5.5vw, 4rem)`** (~36–64px), **tracking -0.025em**, **line-height 1.06**, one **italic terracotta** phrase in the title; hero description uses **sans** at **≥16px** with relaxed line-height and **max-width 65ch**.
3. **Section `h2`:** Playfair **600** at **xl / 2xl** with tight tracking; content column **max-width 760px** per PRODUCT layout; utility links explicitly **font-sans**.

## 2026-04-27 - Frontend hardening (home + global chrome)

1. **Skip link and main landmark:** First focusable control in `layout.tsx` skips to `#main-content`; `<main>` is focusable (`tabIndex={-1}`) with a visible `:focus` outline in `globals.css` and `scroll-mt` so content is not hidden under the sticky header.
2. **Navbar:** Desktop “News” is a disclosure (button `aria-expanded`, panel `id` + `aria-controls`), closes on Escape, outside mousedown, outside `focusin`, and blur leaving the dropdown container. Mobile panel stays in the DOM with the `hidden` attribute, wired to the menu button via `aria-controls`. Touch targets use **min 44px** height on primary controls.
3. **Motion and focus:** `prefers-reduced-motion` disables the page fade animation; `:focus-visible` outline rules apply to interactive elements.
4. **Home (`page.tsx`):** Supabase errors surface a `role="alert"` banner with recovery **Link** to `/`; section headings use `aria-labelledby`; heading rows tolerate long copy (`min-w-0`, `break-words`); “View all” links meet minimum tap height.
5. **PostCard:** Event date prefix emoji is `aria-hidden` so assistive tech does not announce it separately from the date string.

## 2026-03-28 - JWT middleware migration (ES256 / Supabase JWKS)
1. Problem discovered:
   - Token header in requests contains `alg: ES256`, `kid: <uuid>`.
   - Middleware was validating with `[]byte(SUPABASE_JWT_SECRET)` from .env (HMAC flow), causing `ECDSA verify expects *ecdsa.PublicKey`.
2. Root cause:
   - Supabase currently issues ECDSA tokens (signed by private key), while code used symmetric key path.
3. Solution implemented:
   - Added `SUPABASE_URL` to `.env` to locate JWKS URL.
   - Added `internal/middleware/jwks.go`:
     - Fetch public keys from `.../.well-known/jwks.json`
     - Parse JWK ECC `x/y` coordinates to `*ecdsa.PublicKey`
     - Cache keys for performance and key rotation safety.
   - Updated `internal/middleware/auth.go`:
     - Require `ES256` algorithm in signer callback.
     - Read `kid` from token header and resolve key by `jwksCache.GetKey()`.
     - Enforce token validity + email claim + admin table check.
   - Updated `cmd/server/main.go`:
     - Initialize JWKS cache on startup.
     - Fail fast if JWKS fetch fails.
     - Pass cache into RequireAdmin.
4. Test result:
   - Backend now starts and prints `Loaded 1 ECDSA keys from Supabase JWKS`.
   - `curl` against /api/v1/posts (with valid auth) should now pass signature check.

## Architecture notes (resume bullets)
- Designed and shipped secure JWT verification for Supabase in Go using JWKS and ECDSA.
- Built middleware with proper separation: token extraction, auth validation, role lookup.
- Implemented project-wide consistency in docs and architectural reference.

## Metrics and impact (to track)
- `jwt_validation_success_rate` (goal: 99.9%)
- `admin_auth_error_rate` (reduce invalid key errors to 0)
- Key refresh cadence: 1h (JWKS cache TTL)

## Next improvements
- Add automated tests for `RequireAdmin` with live mocked JWKS server.
- Add health endpoint for JWKS status.
- Add telemetry for token issuer/kid success/failure.
