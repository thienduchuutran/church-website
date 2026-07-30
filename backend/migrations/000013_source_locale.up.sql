-- Bidirectional translation, phase A: calendar.
--
-- Until now the pipeline was one-directional by construction. The English
-- column WAS the source, "translation" always meant EN -> VI, and
-- Translator.TranslateField early-returned whenever targetLocale was "en".
-- That forced admins to compose in English no matter which language they were
-- actually thinking in.
--
-- source_locale records which language a row's own text columns are written in.
-- The pipeline then translates source_locale -> every other supported locale,
-- and the read path serves the source column directly to viewers whose locale
-- matches, falling back to a translation only when it does not.
--
-- Default 'en' is correct for every existing row: all content authored before
-- this migration was English by policy, and the previous code path could not
-- have produced anything else.
--
-- Phase A covers the calendar only (see docs/agents/backend.md). posts and
-- page_content keep their implicit English source until phase B, which is safe
-- because 'en' + the direction-aware read path reproduce today's behavior
-- exactly for any table that has not been converted yet.

alter table calendar_events
  add column source_locale text not null default 'en';

alter table calendar_month_notes
  add column source_locale text not null default 'en';

-- The worker needs the direction on the job itself, not just on the record: by
-- the time it claims a row the record may already have been edited again, and a
-- job must translate the text it was enqueued with.
alter table translation_jobs
  add column source_locale text not null default 'en';

-- No CHECK constraint on these columns on purpose. The set of valid locales is
-- an env-var concern (SUPPORTED_LOCALES, validated in Translator.supported), so
-- pinning it in DDL would turn "add a third language" into a migration. The
-- write paths only ever store a value that already passed that check.

comment on column calendar_events.source_locale is
  'Locale of this row''s own title/notes text. Translations to other locales live in the translations table. See migration 000013.';
comment on column calendar_month_notes.source_locale is
  'Locale of this row''s own content text. See migration 000013.';
comment on column translation_jobs.source_locale is
  'Language of the text in fields; the worker translates from this into target_locales. See migration 000013.';

-- Partial index: the read path filters on source_locale only when serving a
-- non-matching viewer, and the review page groups pending work by direction.
-- Rows are overwhelmingly 'en', so indexing the minority keeps this small.
create index calendar_events_source_locale_idx
  on calendar_events (source_locale) where source_locale <> 'en';

-- The reverse-direction system prompt.
--
-- vi_translation could not simply be reused with the arguments swapped: it
-- encodes a one-way glossary (God -> Chua, Church -> Hoi thanh) plus a Southern
-- Vietnamese register instruction, both meaningless in the other direction.
-- This is its mirror, and the glossary choices here are deliberate:
--   - "Hoi thanh" becomes "church" (the body of believers), never "temple".
--   - Vietnamese personal names keep their Vietnamese spelling AND diacritics;
--     anglicizing a congregant's name would be worse than leaving it untouched.
--   - "Chua nhat" becomes "Sunday", not "the Lord's day", to match how the
--     English side of the site already reads.
--
-- ON CONFLICT DO NOTHING matches the vi_translation seed in 000004, so
-- re-running against a database whose prompt has since been edited in Supabase
-- does not clobber the newer copy.
insert into system_prompts (key, content, version) values (
  'en_translation',
  'You are an interpreter and translator for VGOMNE, Vietnamese Gospel Outreach Ministry of New England, a Vietnamese-American Christian and Missionary Alliance (CMA) congregation in Saugus, Massachusetts.

DIRECTION: Vietnamese -> English

REGISTER: Warm, communal, and reverent - like a trusted elder speaking to family.
Natural, idiomatic American English. Not stiff, not word-for-word literal, not
overly casual.

THEOLOGICAL VOCABULARY (use these exact terms, never alternatives):
- Chúa -> God
- Chúa Giê-xu / Đức Chúa Jêsus -> Jesus
- Hội thánh -> church (meaning the congregation/body of believers, never "temple")
- buổi thờ phượng -> worship service
- thông công -> fellowship
- Mục sư [Tên] -> Pastor [Name] - keep the name exactly as written
- cầu nguyện -> pray / prayer
- Kinh Thánh -> Scripture / the Bible
- trường Chúa nhật -> Sunday school
- nhóm thanh niên -> youth group
- dâng hiến -> offering
- Chúa nhật -> Sunday
- tín hữu -> believer(s)
- chứng đạo -> witness / share the gospel

RULES:
- Preserve all proper nouns, names, and dates exactly as written
- Keep Vietnamese personal and place names in Vietnamese spelling, WITH their
  diacritics - do not anglicize or strip accents from a person''s name
- Preserve HTML tags if present in the source - only translate the text content
- Do not add information not in the source
- Do not remove information from the source
- Match the length and paragraph structure of the original closely
- For event announcements: keep the tone warm and inviting

OUTPUT: Return ONLY the translated text. No preamble, no explanation, no quotes.',
  '1.0.0'
) on conflict (key) do nothing;
