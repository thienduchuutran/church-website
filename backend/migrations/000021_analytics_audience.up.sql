-- 000021_analytics_audience.up.sql
-- Tag every analytics row with who produced it: 'public' or 'admin'.
--
-- Until now admin batches were dropped on a client-asserted flag. That hid
-- the admins but could not tell the dashboard anything about them, and the
-- first production day showed the flag arriving too late anyway (the owner's
-- own page views counted as public). From this migration on the backend
-- decides the audience from a verified Supabase token (middleware.OptionalAdmin)
-- and stores the bucket - never the identity - so the dashboard can show
-- Public, Admins, or All.
--
-- Audience joins the analytics_daily primary key because every rollup number
-- is now computed per slice; without it a public row and an admin row for the
-- same (day, metric, dimension) would collide.
--
-- Existing rows default to 'public', which is how they were treated when
-- collected. Written idempotently.

alter table analytics_events
  add column if not exists audience text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'analytics_events_audience_check'
  ) then
    alter table analytics_events
      add constraint analytics_events_audience_check check (audience in ('public', 'admin'));
  end if;
end $$;

create index if not exists analytics_events_audience_idx on analytics_events (audience, occurred_at);

comment on column analytics_events.audience is
  'public or admin, decided server-side from a verified JWT. The admin identity itself is never stored. See migration 000021.';

alter table analytics_daily
  add column if not exists audience text not null default 'public';

-- Re-key: (day, metric, dimension) -> (day, metric, dimension, audience).
-- Guarded so a re-run on a database that already has the four-column key is a
-- no-op rather than an error.
do $$
begin
  if exists (
    select 1
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = 'analytics_daily'::regclass
       and c.contype = 'p'
     group by c.oid
    having count(*) = 3
  ) then
    alter table analytics_daily drop constraint analytics_daily_pkey;
    alter table analytics_daily add primary key (day, metric, dimension, audience);
  end if;
end $$;
