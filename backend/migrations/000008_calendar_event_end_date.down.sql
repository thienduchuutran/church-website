alter table calendar_events
  drop constraint if exists calendar_events_end_after_start;

alter table calendar_events
  drop column if exists end_date;
