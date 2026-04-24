# docs/agents/database.md — Database Reference

## Engine
AWS RDS PostgreSQL (`church-db`, db.t4g.micro, us-east-1).
The Go backend connects via `pgx` using a single database user.
The frontend never touches the database directly — all reads and writes go through the Go backend.

RDS and EC2 communicate privately over port 5432 via auto-created security groups
(`rds-ec2-1` on the RDS instance, `ec2-rds-1` on the EC2 instance). RDS is not publicly accessible.

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
All content on the site — events, announcements, bible studies, playlists, gallery albums.
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
One sidebar note per month — displayed in the 30% right panel of the calendar.
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

## Relationships
```
posts       ──< post_images   (one post has many images)
posts       ──< reactions     (one post has many reactions)
```
`admin_id` on posts and calendar_events stores the Supabase Auth user UUID (JWT sub claim). No FK because `auth.users` lives in Supabase, not RDS.

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
```

---

## Access control (current state)
RLS is **not yet enabled**. The Go backend connects as a single DB user with full access.
Authorization is enforced at the application layer by the `RequireAdmin` middleware in Go.
See `docs/agents/database.md` → "RLS proposal" section for a plan to add DB-level enforcement.

---

## S3 file storage
- **Bucket**: `church-uploads-prod-058264284549-us-east-1-an`
- **Region**: us-east-1 (same as EC2 and RDS — no cross-region latency)
- **Access**: fully private. No public URLs. Access via IAM role attached to EC2.
- **Path convention**: `{post_id}/{filename}` — groups all images for a post together.
- **Go layer**: `backend/internal/storage/s3.go` — `UploadFile`, `DeleteFile`, `PresignedURL`.
- Admin uploads go through the Go backend (`POST /api/v1/posts/:id/images`), not directly to S3 from the browser.

---

## Migration files
Schema changes go in `supabase/migrations/` as `YYYYMMDDHHMMSS_description.sql`.

> **Note:** The original Supabase migration files are incompatible with plain RDS Postgres —
> they used `auth.jwt()`, the `authenticated` role, and Supabase-specific RLS syntax.
> The current RDS schema was created manually with clean plain-Postgres SQL.
> New migrations should use standard PostgreSQL only (no Supabase extensions).

To apply a migration manually:
```bash
psql "$DATABASE_URL" -f supabase/migrations/YYYYMMDDHHMMSS_description.sql
```

---

## Connecting to RDS manually (for debugging)
```bash
# From EC2 (psql installed via apt)
psql "$DATABASE_URL"

# Or with explicit params
psql -h <rds-endpoint> -U <db-user> -d <db-name>
```
RDS is only reachable from inside the EC2 security group — you cannot connect directly from your laptop.
To connect from your laptop: SSH tunnel through EC2.
```bash
ssh -i <key.pem> -L 5432:<rds-endpoint>:5432 ubuntu@<elastic-ip> -N &
psql -h localhost -U <db-user> -d <db-name>
```
