-- 000015_calendar_recurrence.up.sql
-- Give the calendar repeating events, by storing the OCCURRENCES as ordinary
-- rows rather than storing a rule that gets expanded on every read.
--
-- The full reasoning is in DECISIONS.md (2026-09-14). The short version: five
-- separate places read calendar_events - two month queries in this repo, a
-- third read below them, and two more in repository/assistant.go - and only
-- one of them is the calendar. A stored rule would have to be understood by
-- all five, and the two easiest to forget are the assistant's, where the bug
-- surfaces as the chatbot telling a visitor that bible study is on a date two
-- years ago. A generated occurrence that is just a row is understood by all
-- five for free, and is validated by the calendar_events_end_after_start
-- constraint migration 000008 already added.
--
-- What we accept in exchange: rows are generated three years ahead for
-- open-ended series and something has to be clicked before they run out, and a
-- series-wide edit overwrites occurrences that were hand-edited.
--
-- Written idempotently - safe on an unseeded dev DB and on prod.

-- ---------------------------------------------------------------------------
-- 1. The three columns.
--
-- series_id groups the rows one toggle created. It is deliberately NOT a
-- foreign key and deliberately NOT a free-standing UUID: it holds the id of
-- the series' FIRST occurrence, the anchor. That choice is load-bearing in two
-- places. It makes `series_id = id` the test for "is this the anchor", so the
-- rule needs storing exactly once instead of on every row. And it keeps
-- translations.record_id pointing at a real calendar_events row, which matters
-- because repository/translation.go sweeps translations whose parent id no
-- longer exists - see the companion change there, without which the first
-- "Clean up orphans" would delete every recurring event's Vietnamese.
--
-- recurrence_rule lives on the anchor only. text with a CHECK rather than an
-- enum, following the lesson migration 000012 taught about event_type: a
-- vocabulary that can only grow through a migration is a vocabulary that
-- cannot grow. This one is genuinely fixed at two values for now, but the
-- cheap shape is the one that does not need a migration to change its mind.
--
-- recurrence_until is the admin's "Ends on" date. NULL means open-ended, which
-- is the only case the three-year horizon and its warning apply to - a series
-- with a real end date is generated to exactly that date and never needs
-- extending.
-- ---------------------------------------------------------------------------
alter table calendar_events
  add column if not exists series_id        uuid,
  add column if not exists recurrence_rule  text,
  add column if not exists recurrence_until date;

comment on column calendar_events.series_id is
  'Groups the occurrences one recurrence toggle created. Holds the anchor (first) occurrence''s own id, so series_id = id identifies the anchor. No FK: deleting the anchor must not delete its siblings. See migration 000015.';
comment on column calendar_events.recurrence_rule is
  '''weekly'' | ''yearly'', on the ANCHOR row only; NULL on every generated sibling and on every one-off event. See migration 000015.';
comment on column calendar_events.recurrence_until is
  'The admin''s "Ends on" date, anchor row only. NULL means open-ended and is the only case the 3-year horizon applies to. See migration 000015.';

-- ---------------------------------------------------------------------------
-- 2. The shape constraint.
--
-- A row is either a plain event/generated occurrence (no rule, no until) or an
-- anchor (a rule, and series_id pointing at itself). Nothing in between.
--
-- The second branch is what pins recurrence_until to anchors: a sibling cannot
-- carry an "ends on" date, because doing so would require a non-null rule,
-- which would in turn require series_id = id. That closes by construction the
-- gap the council's second verifier found in the competing proposal, where an
-- ordinary event could silently carry an "until" date with no rule to bound.
--
-- Existing rows all land NULL/NULL/NULL and satisfy branch one, so this
-- validates against a populated table without a backfill. That matters here
-- more than most places: migrations auto-apply on backend startup, so a
-- constraint that fails to validate is a failed deploy, not a failed test.
--
-- DO block because Postgres has no ADD CONSTRAINT IF NOT EXISTS.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_events_recurrence_shape'
  ) then
    alter table calendar_events
      add constraint calendar_events_recurrence_shape check (
           (recurrence_rule is null     and recurrence_until is null)
        or (recurrence_rule in ('weekly', 'yearly') and series_id = id)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Indexes.
--
-- The first serves the three scoped writes - "this and following" and "all"
-- are both a WHERE on series_id - and the orphan-sweep clause in
-- repository/translation.go. Partial because recurring events are the
-- minority and always will be.
--
-- The second is a flag index: it exists so "list every series" (which drives
-- the horizon warning) is an index-only scan over a handful of anchors instead
-- of a sequential scan of the whole calendar. Indexing the primary key again
-- looks redundant and is not - the WHERE clause is what makes it small.
-- ---------------------------------------------------------------------------
create index if not exists idx_calendar_events_series
  on calendar_events (series_id) where series_id is not null;

create index if not exists idx_calendar_events_series_anchor
  on calendar_events (id) where recurrence_rule is not null;
