-- Inverse of 000017_month_theme_verse.up.sql.
--
-- Clean, with one honest loss: the authored themes and verses go with the
-- columns. Nothing else breaks. The (year, month) rows survive with their
-- `content` intact, so the info strip's note keeps working exactly as it did
-- before this feature existed, and the card above the grid simply stops
-- rendering because every field it reads is gone.
--
-- Translations for the dropped fields are deliberately deleted here rather
-- than left behind. They are filed against the calendar_month_notes row, which
-- still exists, so the orphan sweep in repository/translation.go would never
-- collect them - it matches on the PARENT row being gone, not the field. Left
-- in place they would sit in the review panel forever, labelled
-- "Month note - 2026-09", offering a Vietnamese translation of a verse the
-- database no longer has. That is the same stale-translation trap documented
-- in docs/agents/known-quirks.md for cleared note text; there is no reason to
-- recreate it on a rollback we control.
--
-- Queue rows go first: the worker re-creates a translation from a pending job
-- within about five seconds, so deleting translations before their jobs would
-- leave the rollback undone.
--
-- translation_jobs has no field_name column - it carries a `fields` jsonb keyed
-- by field name (see CalendarService.enqueueOne) - so the three keys are
-- stripped from the object and only the jobs left with nothing to do are
-- deleted. A job that also carries `content` must survive with its content key
-- intact, or rolling this back would silently cancel a pending translation of
-- the note text, which this migration has no business touching.
update translation_jobs
   set fields = fields - 'theme' - 'verse_text' - 'verse_reference'
 where table_name = 'calendar_month_notes'
   and status = 'pending';

delete from translation_jobs
 where table_name = 'calendar_month_notes'
   and status = 'pending'
   and fields = '{}'::jsonb;

delete from translations
  where table_name = 'calendar_month_notes'
    and field_name in ('theme', 'verse_text', 'verse_reference');

alter table calendar_month_notes
  drop column if exists verse_reference,
  drop column if exists verse_text,
  drop column if exists theme;
