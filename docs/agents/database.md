# docs/agents/database.md - Database Reference

## Engine
Supabase Postgres (project `glcnqlffktqxaizdverk`, region `aws-us-east-1`).
The Go backend connects via `pgx` through Supabase's **session pooler**:
`postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`.
The frontend never touches the database directly - all reads and writes go through the Go backend.

The session pooler (not the transaction pooler on port 6543, and not the direct connection which is IPv6-only) is the right choice for `pgxpool`'s long-lived connections from Render. SSL is required.

---

## Tables

### `admins`
Whitelist of people allowed to access the admin panel.
```sql
create table admins (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,   -- must match Google account email exactly
  display_name text,
  created_at   timestamptz default now()
);
```
> To add the first admin: connect via psql and `INSERT INTO admins (email) VALUES ('you@example.com');`

---

### `posts`
All content on the site - events, announcements, bible studies, playlists, gallery albums.
```sql
create type post_type as enum (
  'event', 'announcement', 'bible_study', 'playlist', 'gallery_album'
);

create table posts (
  id            uuid primary key default gen_random_uuid(),
  type          post_type not null,
  title         text not null,
  body          text,
  event_date    timestamptz,
  external_link text,
  admin_id      uuid,          -- JWT sub claim from Supabase Auth; no FK (auth.users lives in Supabase)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
```

**Type usage guide:**
| type | title | body | event_date | external_link |
|------|-------|------|------------|---------------|
| event | event name | description | required | optional |
| announcement | subject | full message | null | null |
| bible_study | lesson title | optional notes | null | Google Slides/Docs URL |
| playlist | event/retreat name | null | null | Spotify URL |
| gallery_album | album name | optional caption | null | optional Drive link |

---

### `post_images`
Images attached to any post.
```sql
create table post_images (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  storage_key   text not null,       -- R2 object key, e.g. "images/posts/{post_id}/{unixnano}.jpg"
  display_order int default 0,
  created_at    timestamptz default now()
);
```
> `storage_key` is the R2 object key, not a full URL. The Go backend mints a fresh presigned URL on every read.
> Bucket: `church-uploads-prod` on Cloudflare R2 (private, accessed via static R2 keys stored in Render env).

---

### `reactions`
One row per reaction. The unique constraint enforces one reaction per viewer per post.
```sql
create table reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '🙏', '😂')),
  fingerprint text not null,
  created_at  timestamptz default now(),
  unique (post_id, fingerprint)
);
```
> Fingerprint abuse (spam reactions) is rate-limited in the Go service layer, not at the DB level.

---

### `page_content`
Editable text sections for static pages (about, connect).
```sql
create table page_content (
  id          uuid primary key default gen_random_uuid(),
  page_slug   text not null,
  section_key text not null,
  content     text not null default '',
  updated_at  timestamptz default now(),
  unique (page_slug, section_key)
);
```

---

### `calendar_events`
One row per calendar entry on a specific date.
```sql
create type calendar_event_type as enum (
  'birthday', 'bible_study', 'general', 'announcement', 'prayer'
);

create table calendar_events (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  title        text not null,
  event_type   calendar_event_type not null default 'general',
  icon         text not null default 'star',   -- one of 10 curated Phosphor icon keys
  color        text not null default 'slate',  -- one of 8 editorial palette keys
  notes        text,
  admin_id     uuid,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
```

---

### `calendar_month_notes`
One sidebar note per month - displayed in the 30% right panel of the calendar.
```sql
create table calendar_month_notes (
  id         uuid primary key default gen_random_uuid(),
  year       int not null,
  month      int not null check (month between 1 and 12),
  content    text not null default '',
  admin_id   uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (year, month)
);
```

---

### `calendar_month_settings`
Per-month admin styling for the interactive calendar. Currently just an accent
color (hex string). Optional - when no row exists, the frontend falls back to
the static `MONTH_THEMES` palette in `frontend/components/features/calendar/types.ts`.
```sql
create table calendar_month_settings (
  id           uuid primary key default gen_random_uuid(),
  year         int not null,
  month        int not null check (month between 1 and 12),
  accent_color text not null,                                   -- hex string e.g. '#C4663C'
  admin_id     uuid,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (year, month)
);
```

---

## Translation tables

Three tables back the async EN → VI translation engine. They are populated by the Go backend's `internal/translation/` worker; the frontend never writes to them directly. Schema source: `backend/migrations/000004_translations.up.sql`.

### `translations`
Stores every translated field for every record across every locale. Generic by design: a single table serves posts, page_content, and calendar_events.
```sql
create table translations (
  id              uuid primary key default gen_random_uuid(),
  table_name      text not null,                  -- 'posts' | 'page_content' | 'calendar_events' | 'calendar_month_notes'
  record_id       uuid not null,                  -- the source row's UUID
  field_name      text not null,                  -- 'title' | 'body' | 'content' | 'notes'
  locale          text not null,                  -- 'vi' today; extensible
  source_hash     text not null,                  -- sha256(trimmed source). Cache key.
  source_text     text not null,                  -- audit trail: what we translated from
  translated_text text not null,
  is_ai_generated boolean not null default true,
  approved_by     uuid,                           -- JWT sub of bilingual admin who approved/edited
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (record_id, field_name, locale)
);
create index on translations (table_name, record_id, locale);  -- the read-path COALESCE join
create index on translations (source_hash, locale);            -- the cache lookup
```

**Why no FK on `record_id`:** translations are referenced across multiple parent tables (`posts`, `page_content`, ...). A FK would couple this table to a single parent or require a polymorphic FK trick. Orphans are cleaned up out-of-band (see Phase 7 of the original spec).

**Why no FK on `approved_by`:** same convention as `posts.admin_id` and `calendar_events.admin_id` - JWT `sub` claims stored as plain uuid, no FK to `auth.users`. Project sidesteps the Supabase auth schema in application migrations (see "Posting fails with `posts_admin_id_fkey`" in `docs/agents/known-quirks.md`).

**The `approved_by = NULL` reset:** the upsert in `Translator.upsertTranslation` resets `approved_by` and `approved_at` to `NULL` when the source hash changes. Intended: a human approval applies to the exact text it was for. New source text → fresh AI translation, fresh approval required.

### `system_prompts`
Holds the AI system prompt by key. The Go worker reads `vi_translation` at startup and refreshes from this table every 5 minutes (in-memory cache in `PromptCache`).
```sql
create table system_prompts (
  key        text primary key,                    -- 'vi_translation'
  content    text not null,                       -- the full prompt body (theological vocabulary + rules)
  version    text not null,                       -- '1.0.0', '1.1.0', ...
  updated_at timestamptz not null default now()
);
```

**Editing flow:** edit `prompts/vi_translation_system_prompt.md` in the repo, run `./scripts/sync-prompt.sh <new-version>` to upsert into Supabase, and the running backend picks up the change within ~5 minutes (cache TTL) - no redeploy. See Phase 6 of the original spec.

### `translation_jobs`
Job queue polled by the worker. One row per (record, target locales) pair. The worker claims rows with `FOR UPDATE SKIP LOCKED` so multiple backend instances can run safely.
```sql
create table translation_jobs (
  id             uuid primary key default gen_random_uuid(),
  table_name     text not null,
  record_id      uuid not null,
  fields         jsonb not null,                  -- {"title": "<source>", "body": "<source>"}
  target_locales text[] not null,                 -- {'vi'}
  content_type   text not null default 'general', -- 'general' (Gemini) | 'pastoral' (Claude)
  status         text not null default 'pending', -- 'pending' | 'processing' | 'done' | 'failed'
  error          text,
  attempts       int not null default 0,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);
create index on translation_jobs (status, created_at) where status = 'pending';  -- the worker's only query
```

**Lifecycle:** content handler inserts `pending` → worker SELECT FOR UPDATE flips to `processing` and bumps `attempts` → on success becomes `done`, on error becomes `pending` again (retry) or `failed` after 3 attempts.

**Why no FK on `record_id`:** same reason as `translations` - the queue serves multiple parent tables. By the time the worker drains a stale row, the parent record may already have been deleted; the worker tolerates this and the row stays as audit history.

---

## Relationships
```
posts       ──< post_images   (one post has many images)
posts       ──< reactions     (one post has many reactions)
```
`admin_id` on posts and calendar_events stores the Supabase Auth user UUID (JWT `sub` claim). No FK on this column - Supabase Auth's `auth.users` table is in a different schema managed by Supabase, and we deliberately do not couple the application schema to it. See `docs/agents/known-quirks.md` → "Posting fails with `posts_admin_id_fkey`" for the time someone added the FK by mistake and broke writes.

---

## Indexes
```sql
create index on posts(type);
create index on posts(created_at desc);
create index on posts(event_date) where event_date is not null;
create index on post_images(post_id);
create index on reactions(post_id);
create index on page_content(page_slug);
create index on calendar_events(date);
create index on calendar_events(date, event_type);
create index on calendar_month_notes(year, month);
create index on calendar_month_settings(year, month);
```

---

## Access control (current state)
RLS is **not yet enabled**. The Go backend connects as a single DB user with full access.
Authorization is enforced at the application layer by the `RequireAdmin` middleware in Go.
See `docs/agents/database.md` → "RLS proposal" section for a plan to add DB-level enforcement.

---

## R2 file storage
- **Bucket**: `church-uploads-prod` (Cloudflare R2, S3-compatible API)
- **Endpoint**: `https://<account-id>.r2.cloudflarestorage.com` (set as `S3_ENDPOINT` on Render)
- **Region**: `auto` - R2 has no regions; this placeholder satisfies the AWS SDK
- **Access**: fully private. No public URLs. Access via static R2 access key + secret stored in Render env. R2 does not have IAM roles.
- **Path convention**: `{post_id}/{filename}` for images, `videos/hero/{id}.mp4` for hero videos.
- **Go layer**: `backend/internal/storage/s3.go` - `UploadFile`, `DeleteFile`, `PresignedURL`. The same code works against AWS S3 or R2; the only difference is the `endpoint` parameter passed to `NewS3Client`.
- **Path-style URLs required**: when `endpoint != ""`, the code sets `o.UsePathStyle = true` on the SDK client. R2 does not honor virtual-hosted-style URLs.
- Admin uploads go through the Go backend (`POST /api/v1/posts/:id/images`), not directly to R2 from the browser.

---

## Migration files
Schema changes live in `backend/migrations/` as numbered `<NNNNNN>_<description>.up.sql` / `.down.sql` pairs. This folder is the **source of truth**; the files are embedded into the Go binary via `embed.go` and applied on backend startup by `runMigrations` in `backend/cmd/server/main.go` using `github.com/golang-migrate/migrate/v4`. golang-migrate tracks applied migrations in `public.schema_migrations`.

Current files:
```
backend/migrations/
├── 000001_initial_schema.up.sql        ← all tables, enums, indexes
├── 000001_initial_schema.down.sql
├── 000002_hero_video_visibility.up.sql ← alter hero_videos add column is_visible
├── 000002_hero_video_visibility.down.sql
├── 000003_gallery_tags.up.sql          ← tags + post_tags join table
├── 000003_gallery_tags.down.sql
├── 000004_translations.up.sql          ← translations + system_prompts + translation_jobs (seeds vi_translation prompt)
├── 000004_translations.down.sql
└── embed.go                            ← exposes the SQL files as embed.FS to main.go
```

### Adding a new migration
1. Create both files in `backend/migrations/`:
   - `000003_<short_description>.up.sql` - the change.
   - `000003_<short_description>.down.sql` - the inverse, so `migrate down` works in dev.
2. Write plain PostgreSQL only. Avoid Supabase-specific syntax (`auth.jwt()`, `auth.users` FKs, RLS policies). The rationale: `runMigrations` runs as part of Go startup against any `DATABASE_URL`, including local Docker Postgres which has no `auth.users` schema. Authorization is enforced at the application layer via `RequireAdmin` middleware in Go, not at the DB layer.
3. Commit and push. On the next backend deploy, golang-migrate sees the new version in `embed.FS`, compares against `public.schema_migrations`, and runs the up-migration. `migrate.ErrNoChange` is treated as success on subsequent boots.

### One-off SQL outside the migration system
For exploratory queries, reading data, or true emergency hotfixes use the Supabase dashboard SQL editor (Project → SQL Editor). If a hotfix changes the schema, follow up immediately with a normal `backend/migrations/` file so the next fresh database (local dev, staging) reaches the same state.

### `supabase/migrations/` is not used
The `supabase/migrations/` folder holds five files (`001_*` through `20260506_*`) from the original Supabase project setup, before the RDS detour. They carry "LEGACY" headers from when the database was on plain Postgres; the headers are factually outdated now that Supabase is back in front, but the operative instruction (`do not re-apply`) still stands - most of the tables they create are also created by `backend/migrations/000001_initial_schema.up.sql`, so re-applying would conflict. Treat the folder as historical record only.

### Other historical files
- `scripts/rds-schema.sql` - one-shot bootstrap snapshot from the RDS era. Not authoritative; use `backend/migrations/000001_initial_schema.up.sql` for the canonical schema picture.

---

## Connecting to Supabase manually (for debugging)
Supabase is publicly reachable. From your laptop:
```bash
psql "postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
```
The connection string is available in the Supabase dashboard under **Project Settings → Database → Connection string → Session pooler**.

For browser-based work, the Supabase dashboard ships its own SQL editor (Project → SQL Editor) which authenticates via your dashboard session - no password needed.
