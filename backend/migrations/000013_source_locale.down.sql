-- Reverse of 000013.
--
-- Dropping source_locale reverts the pipeline to "the source column is always
-- English". Any row authored in Vietnamese after 000013 ran becomes
-- indistinguishable from English content and will be served as-is to English
-- viewers and re-translated into Vietnamese from Vietnamese. Export or fix
-- those rows before rolling back:
--
--   SELECT id, title FROM calendar_events      WHERE source_locale <> 'en';
--   SELECT year, month FROM calendar_month_notes WHERE source_locale <> 'en';
--
-- The locale='en' rows in translations (the reverse-direction output) are left
-- in place rather than deleted - they are harmless once nothing reads them, and
-- keeping them means a re-apply of 000013 does not have to re-pay for the
-- Gemini calls that produced them.

drop index if exists calendar_events_source_locale_idx;

alter table translation_jobs    drop column if exists source_locale;
alter table calendar_month_notes drop column if exists source_locale;
alter table calendar_events      drop column if exists source_locale;

delete from system_prompts where key = 'en_translation';
