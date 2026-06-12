# progress.md - System Growth & Resume Notes

## Project Context
church-website: a Next.js frontend on Vercel + Go backend on Render + Supabase (Postgres + Auth) + Cloudflare R2 (file storage). Fully serverless, $0/month operating cost.

## 2026-06-12 - Orphan cleanup for the translation engine (closes the "Phase 7" loose end)

When an admin deletes a post/page section/calendar event, its translations lingered forever (the `translations` table has no FKs by design) and cluttered the review panel with `posts:a1b2c3d4`-style labels. Now a "Clean up orphans" button on `/admin/translations` sweeps them. Built TDD-first per the AGENTS.md workflow (handler test → repository → service → handler → route → UI → docs).

| File | Change | Why |
|---|---|---|
| `backend/internal/handler/admin_translations_test.go` | New test file: mock `adminTranslationService`, tests for success / zero-count / service-error | TDD rule; the handler package previously had no translations tests |
| `backend/internal/repository/translation.go` | `DeleteOrphanedTranslations` + `DeleteOrphanedPendingJobs`, sharing an `orphanConditions` whitelist of the four known table_names | Whitelist over blacklist: an unrecognized `table_name` (future content type) is never swept, so the cleanup can't eat valid translations it doesn't understand. Pending jobs must be swept too or the worker re-creates the orphan ~5s later; done/failed jobs stay as audit history |
| `backend/internal/service/translation.go` | `CleanupOrphans` - jobs first, then translations | Sweeping jobs last would leave a window where a just-drained job re-creates an orphan the sweep already deleted |
| `backend/internal/handler/admin_translations.go` + `cmd/server/main.go` | `CleanupOrphans` handler + `POST /admin/translations/cleanup-orphans` (admin group) | Returns 200 (not 202) - the sweep is synchronous, counts are final |
| `frontend/lib/translations.ts` + `app/[locale]/admin/translations/page.tsx` | `cleanupOrphanTranslations` helper + "Clean up orphans" button beside "Re-translate all pending", with a confirm that names exactly what gets deleted | Human-triggered, matching the review panel's human-in-the-loop philosophy; orphan volume at church scale never justifies an automatic background sweep |

Deliberately NOT swept: `fine_tuning_examples` - captured training pairs are designed to survive parent deletion.

Verified: 3 new handler tests pass; SQL exercised against the local Docker Postgres in a rolled-back transaction (orphans deleted including approved ones, unknown table_name kept, failed job kept); `tsc --noEmit` clean.

## 2026-06-11 - Fine-tuning data capture pipeline (additive, zero behavior change)

Every admin approval on `/admin/translations` now silently captures a gold (English source, approved Vietnamese) pair into a new `fine_tuning_examples` table - the dataset for a future LoRA fine-tune of an open-source translation model (full roadmap: `docs/FINE_TUNING_PLAN.md`). Nothing in the serving path changed; the existing translation engine's design rules are untouched.

### Phase 1 - Database

| File | Change | Why |
|---|---|---|
| `backend/migrations/000005_fine_tuning_examples.up.sql` | New `fine_tuning_examples` table (`source_en`, `approved_vi`, `content_type`, `source_field`, `record_table`, `record_id`, `approved_by`, `used_in_training`, `training_run_id`). Partial index on `used_in_training = false`; unique index on `(record_id, source_field, record_table)` | The table IS the dataset. The unique index makes capture idempotent (double-approve = no-op); the partial index keeps exporter scans cheap as consumed rows pile up. No FKs - a deleted post must not delete its training pair, matching the `translations` convention |
| `backend/migrations/000005_fine_tuning_examples.down.sql` | `drop table if exists` | Reversibility in dev, matching every other migration pair |

### Phase 2 - Backend

| File | Change | Why |
|---|---|---|
| `backend/internal/repository/finetuning.go` | `FinetuningExample` struct + `CaptureFinetuningExample` on `TranslationRepository`: `INSERT ... ON CONFLICT (record_id, source_field, record_table) DO NOTHING` | Repository owns the raw SQL (3-layer rule); ON CONFLICT means the call never errors on duplicates |
| `backend/internal/service/translation.go` | After `repo.Approve` succeeds, `captureFinetuningExample(t)` fires a goroutine with `context.Background()` that logs failures and never returns them | Same fire-and-forget pattern as the translation enqueue. Approval is mandatory, capture is best-effort. One hook covers both approve-as-is and edit+approve because both flow through `Approve` - and the repo's `RETURNING` already hands back `source_text` + final `translated_text`, so no extra query |

### Phase 3 - Export tooling

| File | Change | Why |
|---|---|---|
| `scripts/export_training_pairs.py` | Pulls `used_in_training = false` rows + the live `vi_translation` system prompt, writes HuggingFace SFTTrainer JSONL (`system`/`user`/`assistant` messages + metadata) to `fine_tuning_data/training_YYYY-MM-DD.jsonl`. `--dry-run` prints count breakdowns only. Deliberately never flips `used_in_training` | Pairs leave the DB in exactly the format the future training notebook consumes, carrying the same system prompt the model will see at inference. Re-export stays lossless; marking pairs consumed is the training run's job |
| `.gitignore` | `fine_tuning_data/` | Dataset artifacts, not source |

### Phase 4 - Documentation

`docs/FINE_TUNING_PLAN.md` (why Qwen2.5-7B-Instruct, the Southern-dialect rationale, Phases 0-3 with eval gates), `docs/agents/database.md` (table doc + migration list), `docs/agents/backend.md` (folder map + capture section), `AGENTS.md` (routing rule).

### Architecture notes (resume bullets)
- **Human-in-the-loop review doubles as dataset labeling.** The approval flow the admins already use produces training pairs as a free side effect - no separate annotation workflow, no extra UI.
- **Best-effort side effects stay off the critical path.** Capture mirrors the engine's enqueue pattern: goroutine + `context.Background()` + log-and-swallow. An INSERT failure can never fail an approval.
- **Idempotency via constraint, not application logic.** `ON CONFLICT DO NOTHING` against a unique index is the whole dedup story; no read-before-write race.

### Current status / next trigger
Phase 0 (collection) is live. Run `python scripts/export_training_pairs.py --dry-run` periodically; at 200+ pairs with a healthy content-type mix, start Phase 1 of `docs/FINE_TUNING_PLAN.md` (first LoRA experiment on Colab).

## 2026-05-15 - Full AWS exodus to serverless ($0/month infrastructure)

Migrated the entire stack off AWS while keeping the live site reachable throughout. End state: zero AWS resources, zero monthly bill, same product. Each step was independently reversible.

1. **Database (RDS → Supabase Postgres).** Took a `pg_dump --no-owner --no-acl --schema=public -Fc` of the RDS instance from EC2, used `pg_restore --clean --if-exists` to replace the legacy Supabase project's `public` schema. Used the session pooler at `aws-1-us-east-1.pooler.supabase.com:5432` because Supabase's direct connection is IPv6-only and EC2 lacks IPv6. Cut over by editing `DATABASE_URL` in the systemd service file, then `daemon-reload && restart`. Discovered a rogue `/home/ubuntu/church-website/backend/.env` was overriding the systemd value via godotenv's fallback - renamed it `.env.bak-migration`. Also learned systemd treats `%` as a specifier prefix, so the URL-encoded `%40` (for the `@` in the password) had to be doubled to `%%40` on systemd; Render later took the same URL with a single `%40` because it doesn't have that quirk.
2. **Object storage (S3 → Cloudflare R2).** Added an `endpoint string` parameter to `storage.NewS3Client` in `backend/internal/storage/s3.go`. When `endpoint != ""`, the SDK gets a custom `BaseEndpoint` plus `UsePathStyle = true` - that combination redirects all PutObject/DeleteObject/PresignGetObject calls to R2 while keeping the existing function signatures. Set `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and bucket name in production env vars. One-time data migration: `aws s3 sync` from RDS-era EC2's IAM role into `/tmp/`, then upload from `/tmp/` to R2 using a separate `--profile r2 --endpoint-url <r2-endpoint>` (one set of credentials per `sync` call meant a two-step copy was simpler than rclone). 30 MB total, 5 hero mp4s.
3. **Backend (EC2 + systemd → Render).** Render auto-deploys from `master` via Docker. Copied all env vars from the EC2 systemd file to Render's dashboard (note: single `%40` here, not `%%40`). External cron-job.org ping keeps the free instance warm; without it, first request after 15 min of inactivity waits ~50 s for cold start.
4. **Frontend (EC2 + Nginx → Vercel).** Vercel auto-detects Next.js, builds from `frontend/` subdirectory. Hit `ERESOLVE` peer-dep conflict because `@emoji-mart/react` declares React 16/17/18 but we run 19. Fixed with `frontend/.npmrc` containing `legacy-peer-deps=true` - same flag GitHub Actions already used. Updated Render's `FRONTEND_ORIGIN` to the Vercel URL for CORS, and Supabase Auth's URL Configuration so OAuth callbacks work from the new origin.
5. **AWS cleanup.** Deleted RDS (after final snapshot). Emptied + deleted the S3 bucket. Revoked the IAM user access keys. Terminated EC2. Released the Elastic IP (the silent ~$3.50/month trap that AWS charges for unattached EIPs). Removed the `ChurchEC2S3Role` IAM role and custom security groups.
6. **DNS** stayed on No-IP's free `vgomne.ddns.net` pointing at the now-defunct Elastic IP. Custom domain on Vercel is available as a future polish (A record to `76.76.21.21` + optional `vercel.json` rewrite to proxy `/api/*` to Render, eliminating CORS) but was deferred to keep the migration focused on cost.

### Lessons / architectural notes (resume bullets)
- **Serverless cutover patterns:** built each new platform alongside the old one, verified equivalence, then flipped one config line at the boundary. Total downtime: zero.
- **Single source of truth for environment variables matters:** the rogue EC2 `.env` overriding systemd taught me that "have config in two places" is how you get hours of mysterious bugs. godotenv's gap-filling behavior is convenient until it's invisible.
- **S3-compatible APIs are real:** the same `aws-sdk-go-v2` code drives both AWS S3 and Cloudflare R2 with one boolean flag (`UsePathStyle`) and one URL override (`BaseEndpoint`). No rewrites required when changing providers.
- **systemd specifier escaping:** `%` is reserved in `Environment=` directives; doubled `%%` produces a literal `%`. URL-encoded passwords are the classic gotcha.

### Cost impact
- Before: ~$22/month (EC2 t4g.micro + RDS db.t4g.micro + S3 + EBS + occasional EIP). ~$264/year.
- After: $0/month. All services on free tiers comfortably within their quotas for a pre-launch church site.

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
