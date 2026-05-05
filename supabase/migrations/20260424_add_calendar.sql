-- LEGACY: applied when DB was on Supabase. DB is now plain Postgres (Docker/RDS).
-- Source of truth is scripts/rds-schema.sql. Do not re-apply.
--
-- Interactive calendar: day-level events and month-level sidebar notes.

create type calendar_event_type as enum (
  'birthday',
  'bible_study',
  'general',
  'announcement',
  'prayer'
);

-- One row per calendar entry on a specific date.
-- icon  — Phosphor icon key (e.g. 'cake', 'book-open', 'bell')
-- color — editorial palette key (e.g. 'red', 'amber', 'emerald')
create table calendar_events (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  title        text not null,
  event_type   calendar_event_type not null default 'general',
  icon         text not null default 'star',
  color        text not null default 'slate',
  notes        text,
  admin_id     uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index on calendar_events(date);
create index on calendar_events(date, event_type);

-- One row per month — the "eye-catchy" sidebar note block shown beside the calendar.
create table calendar_month_notes (
  id         uuid primary key default gen_random_uuid(),
  year       int not null,
  month      int not null check (month between 1 and 12),
  content    text not null default '',
  admin_id   uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (year, month)
);

create index on calendar_month_notes(year, month);

-- RLS: public SELECT only. All writes go through the Go backend (service role key).
alter table calendar_events enable row level security;
create policy "Public read access" on calendar_events
  for select using (true);

alter table calendar_month_notes enable row level security;
create policy "Public read access" on calendar_month_notes
  for select using (true);
