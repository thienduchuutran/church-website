-- Inverse of 000016_calendar_rrule.up.sql.
--
-- Lossy, and honest about it: any rule richer than plain weekly or yearly has
-- no representation in the old two-word vocabulary. Those anchors are demoted
-- to one-off events - their rule, and only their rule, is dropped.
--
-- Every occurrence row survives untouched. That is the same property that made
-- 000015's rollback safe: a generated date is an ordinary event, so losing the
-- rule loses the ability to extend the series, never the congregation's
-- calendar. The events an admin can already see stay exactly where they are.
alter table calendar_events
  drop constraint if exists calendar_events_recurrence_shape;

update calendar_events set recurrence_rule = 'weekly' where recurrence_rule = 'FREQ=WEEKLY';
update calendar_events set recurrence_rule = 'yearly' where recurrence_rule = 'FREQ=YEARLY';

-- Anchors whose rule cannot be expressed in the old vocabulary become plain
-- events. recurrence_until has to go with the rule or the restored 000015
-- constraint would reject the row.
update calendar_events
   set recurrence_rule = null, recurrence_until = null
 where recurrence_rule is not null
   and recurrence_rule not in ('weekly', 'yearly');

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
