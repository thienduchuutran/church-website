-- Multi-day calendar events (banner ribbons like the hand-made paper
-- calendars: "Youth Camp May 22-25", "Church renovation").
--
-- A single event row now optionally carries an end_date - the inclusive last
-- day of the span. NULL means a single-day event, which is every existing row,
-- so this column is purely additive and changes no current behaviour.
--
-- Why one nullable column and not a separate "spans" table or one row per day:
-- the span is a property of the event, not a new entity. One row keeps editing
-- and deleting trivial (change/remove the one row) and lets the month query
-- treat single- and multi-day events uniformly.

alter table calendar_events
  add column end_date date;

-- Hard guarantee a span never ends before it starts, regardless of how the row
-- was written (API, future seed script, manual SQL). The frontend also caps the
-- end-date picker's min at the start date, but this is the backstop.
alter table calendar_events
  add constraint calendar_events_end_after_start
  check (end_date is null or end_date >= date);
