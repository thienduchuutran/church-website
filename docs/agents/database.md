# docs/agents/database.md — Database Reference

## Engine
Postgres (managed by Supabase). Access via `pgx` in Go backend using the service role key.
The frontend never writes to the database directly — all mutations go through the Go backend.
The frontend may read public data directly from Supabase using the anon public key.

---

## Tables

### `auth.users`
Built-in Supabase table. Auto-populated on Google login. Never create or modify manually.
Key field: `id` (uuid), `email` (text).

---

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
> To add the first admin: Supabase dashboard → Table Editor → admins → Insert row → paste email.

---

### `posts`
All content on the site — events, announcements, bible studies, playlists, gallery albums.
```sql
create type post_type as enum (
  'event', 'announcement', 'bible_study', 'playlist', 'gallery_album'
);

create table posts (
  id            uuid primary key default gen_random_uuid(),
  type          post_type not null,
  title         text not null,
  body          text,                         -- optional description
  event_date    timestamptz,                  -- only for type = 'event'
  external_link text,                         -- Spotify, Google Slides, Drive links
  admin_id      uuid references auth.users(id) on delete set null,
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
Images attached to any post. A gallery_album typically has many; an event may have one hero image.
```sql
create table post_images (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  storage_url   text not null,       -- Supabase Storage public URL
  display_order int default 0,       -- 0 = first image shown
  created_at    timestamptz default now()
);
```

---

### `reactions`
One row per reaction. The unique constraint on (post_id, fingerprint) enforces one reaction per viewer per post.
```sql
create table reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '🙏', '😂')),
  fingerprint text not null,         -- browser fingerprint, not a login
  created_at  timestamptz default now(),
  unique (post_id, fingerprint)
);
```
> When a viewer changes their reaction, the backend does an upsert: update `emoji` where (post_id, fingerprint) matches.

---

### `page_content`
Editable text sections for static pages (about, connect). Each row is one key-value pair scoped to a page slug.
```sql
create table page_content (
  id          uuid primary key default gen_random_uuid(),
  page_slug   text not null,        -- 'about' or 'connect'
  section_key text not null,        -- e.g. 'hero_title', 'mission_body'
  content     text not null default '',
  updated_at  timestamptz default now(),
  unique (page_slug, section_key)
);
```
> Admins edit these via `/admin/pages/:slug`. The frontend reads them via `GET /api/v1/pages/:slug`.

---

## Relationships
```
auth.users  ──< admins        (one Google user whitelisted as one admin row)
admins      ──< posts         (one admin creates many posts)
posts       ──< post_images   (one post has many images)
posts       ──< reactions     (one post has many reactions)
```

---

## Indexes
```sql
create index on posts(type);
create index on posts(created_at desc);
create index on posts(event_date) where event_date is not null;
create index on post_images(post_id);
create index on reactions(post_id);
create index on page_content(page_slug);
```

---

## Row Level Security
- `admins` — no public access (backend service role only)
- `posts` — public SELECT, no public INSERT/UPDATE/DELETE
- `post_images` — public SELECT, no public INSERT/UPDATE/DELETE
- `reactions` — public SELECT, INSERT, UPDATE, DELETE (fingerprint abuse handled in Go service layer)
- `page_content` — public SELECT, no public INSERT/UPDATE/DELETE (admin writes via backend service role)

All writes to `posts` and `post_images` go through the Go backend, which uses the service role key that bypasses RLS entirely.

---

## Storage bucket
Bucket name: `church-media` (public bucket).
Path convention: `{post_id}/{filename}` — groups all images for a post together.
Admins upload directly from the frontend to Supabase Storage using the authenticated session token.
The resulting public URL is then sent to the Go backend and saved in `post_images.storage_url`.

---

## Migration files
All schema changes go in `supabase/migrations/` as YYYYMMDDHHMMSS_description.sql (the CLI generates these if you use supabase migration new description).
Never modify the database schema directly via the Supabase dashboard UI without also adding a migration file.
Format: `YYYYMMDDHHMMSS_description.sql`, `YYYYMMDDHHMMSS_description.sql`, etc.
