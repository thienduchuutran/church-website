-- Per-month accent color override for the interactive calendar.
-- Admins pick a hex color in the inline color picker on the calendar page; the saved
-- value tints the day-of-week header, month title, and "today" marker for that month.
-- Falls back to MONTH_THEMES on the frontend when no row exists.

-- HISTORICAL: from the original Supabase project setup. The canonical schema now
-- lives in backend/migrations/ (golang-migrate, applied on backend startup). Do not
-- re-apply this file - the calendar_month_settings table is also created by 000001
-- in that folder.
--
-- admin_id is plain uuid with no FK on purpose. auth.users now lives in the same
-- database again (since the move back to Supabase), but the column stays decoupled -
-- access control is enforced at the Go layer via RequireAdmin middleware, and a
-- stray FK once broke writes (see docs/agents/known-quirks.md "Posting fails with
-- posts_admin_id_fkey").
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
