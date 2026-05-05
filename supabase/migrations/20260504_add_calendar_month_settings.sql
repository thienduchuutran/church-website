-- Per-month accent color override for the interactive calendar.
-- Admins pick a hex color in the inline color picker on the calendar page; the saved
-- value tints the day-of-week header, month title, and "today" marker for that month.
-- Falls back to MONTH_THEMES on the frontend when no row exists.

-- admin_id is plain uuid with no FK — auth.users lives in Supabase, not RDS.
-- No RLS either: access control is enforced at the Go layer (RequireAdmin middleware).
-- This matches the pattern used by calendar_events and calendar_month_notes.
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

create index on calendar_month_settings(year, month);
