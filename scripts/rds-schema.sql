-- RDS schema — plain Postgres, no Supabase-specific syntax.
-- No RLS, no auth.users references, no PgBouncer workarounds.
-- Run once against a fresh RDS instance:
--   psql "$RDS_URL" -f scripts/rds-schema.sql

-- ── Enums ────────────────────────────────────────────────────────────────────

create type post_type as enum (
  'event', 'announcement', 'bible_study', 'playlist', 'gallery_album'
);

create type calendar_event_type as enum (
  'birthday', 'bible_study', 'general', 'announcement', 'prayer'
);

-- ── Tables ───────────────────────────────────────────────────────────────────

-- Admin whitelist: only emails in this table may use the admin panel.
-- The Go backend reads this table via RequireAdmin middleware.
create table admins (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  display_name text,
  created_at   timestamptz default now()
);

-- All site content: events, announcements, bible studies, playlists, albums.
-- admin_id stores the JWT sub claim (Supabase auth user UUID); no FK needed
-- since auth.users lives in Supabase, not here.
create table posts (
  id            uuid primary key default gen_random_uuid(),
  type          post_type not null,
  title         text not null,
  body          text,
  event_date    timestamptz,
  external_link text,
  admin_id      uuid,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table post_images (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  storage_key   text not null,
  display_order int default 0,
  created_at    timestamptz default now()
);

-- No FK on post_id — posts are read from Supabase by the frontend directly,
-- so RDS has no posts table to reference. Referential integrity is handled
-- at the application layer (the post must exist for the frontend to render it).
create table reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null,
  emoji       text not null check (emoji in ('👍', '❤️', '🙏', '😂')),
  fingerprint text not null,
  created_at  timestamptz default now(),
  unique (post_id, fingerprint)
);

-- Editable text sections for static pages (about, connect).
create table page_content (
  id          uuid primary key default gen_random_uuid(),
  page_slug   text not null,
  section_key text not null,
  content     text not null default '',
  updated_at  timestamptz default now(),
  unique (page_slug, section_key)
);

-- Calendar: one row per day-level entry.
create table calendar_events (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  title        text not null,
  event_type   calendar_event_type not null default 'general',
  icon         text not null default 'star',
  color        text not null default 'slate',
  notes        text,
  admin_id     uuid,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Calendar: one sidebar note per month.
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

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index on posts(type);
create index on posts(created_at desc);
create index on posts(event_date) where event_date is not null;
create index on post_images(post_id);
create index on reactions(post_id);
create index on page_content(page_slug);
create index on calendar_events(date);
create index on calendar_events(date, event_type);
create index on calendar_month_notes(year, month);
