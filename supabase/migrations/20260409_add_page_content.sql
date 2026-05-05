-- LEGACY: applied when DB was on Supabase. DB is now plain Postgres (Docker/RDS).
-- Source of truth is scripts/rds-schema.sql. Do not re-apply.
--
-- Editable text sections for static pages (about, connect).
-- Each row is one key-value pair scoped to a page slug.
create table page_content (
  id          uuid primary key default gen_random_uuid(),
  page_slug   text not null,
  section_key text not null,
  content     text not null default '',
  updated_at  timestamptz default now(),
  unique (page_slug, section_key)
);

create index on page_content(page_slug);

-- RLS: public SELECT, no public INSERT/UPDATE/DELETE.
-- Admin writes go through the Go backend using the service role key.
alter table page_content enable row level security;

create policy "Public read access" on page_content
  for select using (true);
