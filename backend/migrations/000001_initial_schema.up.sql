create type post_type as enum (
  'event', 'announcement', 'bible_study', 'playlist', 'gallery_album'
);

create type calendar_event_type as enum (
  'birthday', 'bible_study', 'general', 'announcement', 'prayer'
);

create table admins (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  display_name text,
  created_at   timestamptz default now()
);

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

create table reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null,
  emoji       text not null check (emoji in ('👍', '❤️', '🙏', '😂')),
  fingerprint text not null,
  created_at  timestamptz default now(),
  unique (post_id, fingerprint)
);

create table page_content (
  id          uuid primary key default gen_random_uuid(),
  page_slug   text not null,
  section_key text not null,
  content     text not null default '',
  updated_at  timestamptz default now(),
  unique (page_slug, section_key)
);

create table calendar_events (
  id               uuid primary key default gen_random_uuid(),
  date             date not null,
  title            text not null,
  event_type       calendar_event_type not null default 'general',
  icon             text not null default 'star',
  color            text not null default 'slate',
  notes            text,
  private_address  text,
  admin_id         uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

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

create table calendar_month_settings (
  id           uuid primary key default gen_random_uuid(),
  year         int not null,
  month        int not null check (month between 1 and 12),
  accent_color text not null,
  admin_id     uuid,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (year, month)
);

create table hero_videos (
  id           uuid        primary key default gen_random_uuid(),
  storage_key  text        not null,
  file_name    text        not null,
  file_size    bigint,
  content_type text,
  uploaded_by  uuid,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now()
);

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
create index on hero_videos(is_active);
create unique index hero_videos_one_active on hero_videos(is_active) where is_active = true;
