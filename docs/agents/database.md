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
  storage_key   text not null,       -- S3 object key, e.g. "{post_id}/{filename}"
  display_order int default 0,
  created_at    timestamptz default now()
);
```
> `storage_key` is the S3 object key, not a full URL. The Go backend constructs the presigned URL on demand.
> Bucket: `church-uploads-prod-058264284549-us-east-1-an` (us-east-1, private, IAM-controlled).

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
The Go backend embeds SQL migrations in `backend/migrations/` and applies them on startup via `golang-migrate`. The migrator is idempotent - on each boot it consults `schema_migrations` and applies any new entries.

Migration files use plain PostgreSQL only (no Supabase RLS / `auth.jwt()` extensions). The schema runs identically against local Docker Postgres, the former RDS instance, and the current Supabase project.

To apply a migration manually outside the app (rare):
```bash
psql "$DATABASE_URL" -f backend/migrations/<file>.up.sql
```

---

## Connecting to Supabase manually (for debugging)
Supabase is publicly reachable. From your laptop:
```bash
psql "postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
```
The connection string is available in the Supabase dashboard under **Project Settings → Database → Connection string → Session pooler**.

For browser-based work, the Supabase dashboard ships its own SQL editor (Project → SQL Editor) which authenticates via your dashboard session - no password needed.
