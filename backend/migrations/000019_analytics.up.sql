-- 000019_analytics.up.sql
-- First-party, cookie-free usage analytics.
--
-- Three tables, three grains:
--
--   analytics_events         one row per thing a visitor did (raw, append-only)
--   analytics_daily          one row per (day, metric, dimension) - what the
--                            admin dashboard actually reads
--   analytics_request_stats  one row per (hour, route pattern, status class)
--                            from the Go logger middleware - latency + errors
--
-- Why raw AND rolled up. The dashboard could aggregate the raw table on every
-- page load, and at this congregation's traffic it would even be fast. But a
-- rollup table makes every chart a few hundred rows no matter how old the site
-- gets, and it means a bug in an aggregate query is fixed by re-running the
-- rollup, not by losing the number. The raw table is the source of truth; the
-- rollup is a cache that the worker rebuilds for today and yesterday every tick.
--
-- Why there is no visitor table and no IP column. visitor_hash is
-- sha256(secret || day || ip || user_agent). The same phone is one visitor
-- within a day; tomorrow the hash is different and nothing links the two rows.
-- That is what lets the site count unique visitors without a cookie or a
-- consent banner, and it means a leaked copy of this table identifies nobody.
-- See docs/agents/database.md -> "Analytics tables".
--
-- Written idempotently - safe on an unseeded dev DB and on prod.

create table if not exists analytics_events (
  id            bigserial primary key,
  occurred_at   timestamptz not null,
  visitor_hash  text not null,
  session_id    text not null,
  event_name    text not null,
  path          text not null,
  locale        text not null,
  referrer_host text,
  device        text not null,
  duration_ms   integer,
  is_returning  boolean not null default false,
  props         jsonb not null default '{}'::jsonb,
  constraint analytics_events_device_check check (device in ('phone', 'tablet', 'desktop'))
);

comment on table analytics_events is
  'Raw visitor events, append-only, pruned after ~400 days by the analytics rollup worker. No IP, no raw user agent, no user id: visitor_hash rotates daily. See migration 000019.';
comment on column analytics_events.path is
  'Normalised route, never a raw URL: query string stripped, UUID segments collapsed to {id}. The real post id, when relevant, lives in props.post_id.';
comment on column analytics_events.is_returning is
  'Client-reported: the browser had a last-visit date within the previous 30 days (not today). The server cannot derive this because visitor_hash rotates daily.';

-- Time-ordered scans are the common case (rollup of one day, prune of old
-- rows); the two composite indexes serve "top pages" and per-event counts.
create index if not exists analytics_events_occurred_at_idx on analytics_events (occurred_at);
create index if not exists analytics_events_event_name_idx  on analytics_events (event_name, occurred_at);
create index if not exists analytics_events_path_idx        on analytics_events (path, occurred_at);

-- dimension is '' for a total and e.g. 'vi', 'phone', '/events/{id}' for a
-- breakdown row. An empty string rather than NULL so the primary key can hold
-- it (NULLs are never equal, so (day, metric, NULL) would not be unique).
create table if not exists analytics_daily (
  day        date not null,
  metric     text not null,
  dimension  text not null default '',
  value      numeric not null,
  primary key (day, metric, dimension)
);

comment on table analytics_daily is
  'Pre-aggregated daily numbers the admin dashboard reads. Rebuilt for today and yesterday on every rollup tick, so it is safe to delete rows and let the worker refill them. Kept forever. See migration 000019.';

-- Request stats are bucketed by chi route PATTERN (e.g. /api/v1/posts/{id}),
-- never the concrete URL, so the number of distinct rows per hour is bounded
-- by the number of routes, not by what a scanner decides to request.
create table if not exists analytics_request_stats (
  hour         timestamptz not null,
  route        text not null,
  status_class text not null,
  count        integer not null,
  p50_ms       integer not null,
  p95_ms       integer not null,
  primary key (hour, route, status_class),
  constraint analytics_request_stats_status_check check (status_class in ('2xx', '3xx', '4xx', '5xx'))
);

comment on table analytics_request_stats is
  'Hourly backend latency and error counts per route pattern, flushed by the analytics rollup worker from the logger middleware''s in-memory buckets. /api/v1/health is excluded so the keep-warm pinger does not dominate. See migration 000019.';
