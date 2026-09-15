-- 000016_calendar_rrule.up.sql
-- Widen the recurrence vocabulary from two hardcoded words to RFC 5545 RRULE
-- text, so an admin can say "first Sunday of the month" or "every second
-- Tuesday" instead of picking from weekly and yearly.
--
-- This does NOT reverse the decision in DECISIONS.md (2026-09-14) to store
-- occurrences as rows. That decision rejected EXPANDING a rule every time
-- somebody looks at the calendar, which would have put the expander in front of
-- five separate readers. Rules are still expanded exactly once, on save, in
-- internal/service/rrule.go, and what lands in this table is still ordinary
-- dated rows. Richer rules cost generator complexity and nothing at all on the
-- read path - which is precisely why the revisit trigger that entry predicted
-- fired without the storage model having to change.
--
-- Storing RRULE text rather than a private format also has a second payoff: it
-- is the string an .ics feed needs, and an ".ics subscription" request is the
-- one scenario that entry names as able to expire the whole decision. Writing
-- the standard form now costs nothing and removes part of that rewrite.
--
-- Written idempotently - safe on an unseeded dev DB, on a DB where 000015 has
-- already run, and on prod.

-- ---------------------------------------------------------------------------
-- 1. Drop the old shape constraint before rewriting the values it forbids.
-- ---------------------------------------------------------------------------
alter table calendar_events
  drop constraint if exists calendar_events_recurrence_shape;

-- ---------------------------------------------------------------------------
-- 2. Convert the two legacy values.
--
-- A data migration inside a schema migration, which is normally a thing to
-- avoid here because migrations auto-apply on backend startup with nobody
-- watching. It is acceptable in this one case because the domain is literally
-- two known strings, the mapping is total, and the down migration reverses it
-- exactly. Anything requiring judgement - grouping the calendar's hand-typed
-- birthdays into series, say - belongs in a reviewable command with a dry run,
-- not in here. See cmd/adopt-birthdays.
-- ---------------------------------------------------------------------------
update calendar_events set recurrence_rule = 'FREQ=WEEKLY' where recurrence_rule = 'weekly';
update calendar_events set recurrence_rule = 'FREQ=YEARLY' where recurrence_rule = 'yearly';

-- ---------------------------------------------------------------------------
-- 3. The new shape constraint.
--
-- The regex is a SHAPE backstop, not a parser - the same division of labour as
-- calendar_palette_colors' hex CHECK, where Go owns the real rule and the
-- database owns "this cannot be nonsense". Authoritative validation lives in
-- service.ParseRRule, which rejects anything the generator cannot expand, so
-- the database can never hold a rule that would render confidently wrong dates.
--
-- The two branches are unchanged in spirit from 000015: a row is either an
-- ordinary event or occurrence (no rule, no end date) or a series anchor
-- pointing at itself. That is still what pins recurrence_until to anchors.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_events_recurrence_shape'
  ) then
    alter table calendar_events
      add constraint calendar_events_recurrence_shape check (
           (recurrence_rule is null and recurrence_until is null)
        or (recurrence_rule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,+-]+)*$'
            and series_id = id)
      );
  end if;
end $$;

comment on column calendar_events.recurrence_rule is
  'RFC 5545 RRULE text on the ANCHOR row only, e.g. FREQ=MONTHLY;BYDAY=1SU. Limited to the subset service.ParseRRule can expand; the DB CHECK is a shape backstop, not a parser. NULL on every generated sibling and one-off event. See migration 000016.';
