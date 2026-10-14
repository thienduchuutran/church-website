-- Inverse of 000018_year_theme_verse.up.sql.
--
-- Loses no text. The year's theme and verse land back on that year's JANUARY
-- row, which is arbitrary but honest: the month grain holds more information
-- than the year grain, so moving back down has to pick a month and there is no
-- better answer than the first one. A rollback followed by a re-apply is
-- therefore stable - January is exactly where clause 2 of the up migration
-- would find it again.
--
-- Columns come back before anything is written into them.
alter table calendar_month_notes
  add column if not exists theme           text not null default '',
  add column if not exists verse_text      text not null default '',
  add column if not exists verse_reference text not null default '';

-- A year whose January never had a note has no row to land on, so make one.
-- Empty content, because the note text is a separate thing that genuinely had
-- nothing in it - this is not inventing content, it is creating the hook the
-- theme hangs on.
insert into calendar_month_notes (year, month, content, source_locale)
select yc.year, 1, '', yc.source_locale
  from calendar_year_content yc
on conflict (year, month) do nothing;

update calendar_month_notes mn
   set theme           = yc.theme,
       verse_text      = yc.verse_text,
       verse_reference = yc.verse_reference,
       source_locale   = yc.source_locale,
       updated_at      = now()
  from calendar_year_content yc
 where mn.year = yc.year
   and mn.month = 1;

-- Re-point the translations the same way the up migration moved them, so a
-- round trip preserves 'Ưu tiên' and its pending-approval state rather than
-- stranding it against a table that is about to be dropped.
update translations t
   set table_name = 'calendar_month_notes',
       record_id  = mn.id
  from calendar_year_content yc
  join calendar_month_notes mn on mn.year = yc.year and mn.month = 1
 where t.table_name = 'calendar_year_content'
   and t.record_id  = yc.id;

-- Pending jobs for the dropped table would re-create translations pointing at a
-- record that no longer exists.
delete from translation_jobs
 where table_name = 'calendar_year_content';

drop table if exists calendar_year_content;
