-- Inverse of 000015_calendar_recurrence.up.sql.
--
-- This rollback is clean, and that was one of the reasons the design was
-- chosen. Every generated occurrence is an ordinary row with a real date, a
-- real title and a real event_type, so dropping the grouping columns loses
-- only the knowledge that the rows were related. Nothing disappears from the
-- calendar and nothing reappears on it. There are no cancellation tombstones
-- in this design, so there is no row whose meaning inverts when a column it
-- depended on goes away - the failure mode that made the competing proposal's
-- rollback unsafe.
--
-- One honest degradation. Translations for a series are filed under the anchor
-- occurrence's id, and the month query after this rollback joins translations
-- on the event's own id again. The anchor therefore keeps its translation and
-- its siblings fall back to showing their source language until they are next
-- saved. That is the same missing-translation fallback the read path already
-- has for a record the worker has not reached yet - visible, not broken.
--
-- Constraint first, then indexes, then columns: the constraint references the
-- columns, so dropping them in the other order fails on a dependency.
alter table calendar_events
  drop constraint if exists calendar_events_recurrence_shape;

drop index if exists idx_calendar_events_series_anchor;
drop index if exists idx_calendar_events_series;

alter table calendar_events
  drop column if exists recurrence_until,
  drop column if exists recurrence_rule,
  drop column if exists series_id;
