-- 000018_year_theme_verse.up.sql
-- Move the theme and memory verse from a month to a whole year.
--
-- Migration 000017 put theme/verse_text/verse_reference on calendar_month_notes
-- because that row was already keyed (year, month) and the content looked
-- month-scoped. It is not: the congregation picks ONE theme and ONE memory
-- verse for the year, and every month of that year carries it.
--
-- (year, month) and (year) are different keys, so the columns cannot stay where
-- they are. The alternative - writing the same theme onto all twelve rows of a
-- year - would mean twelve copies to keep in sync and twelve translation jobs
-- for one sentence, with no way to express "these twelve are the same fact".
--
-- The freeform `content` note STAYS on calendar_month_notes. It is logistics
-- ("Family Camp, 71 King Dr", "8:30pm arrival") and genuinely differs month to
-- month. Only the three devotional columns move.
--
-- Written idempotently - safe on an unseeded dev DB and on prod.

-- ---------------------------------------------------------------------------
-- 1. The table.
--
-- A uuid primary key with `year` UNIQUE, rather than `year` as the primary key
-- directly. That is not ceremony: translations.record_id is a uuid, so a row
-- the translation engine can point at must have one. `year` carries the real
-- rule - one row per year, enforced by the database rather than by convention.
--
-- `not null default ''` mirrors calendar_month_notes for the same reason it did
-- there: the read path resolves each field through COALESCE(translation,
-- stored), and with NULLs in play a field the admin had just cleared would let
-- a stale translation win the COALESCE and reappear on the page.
--
-- source_locale travels with the content because the detected language is a
-- property of the text, not of the month it used to live in.
-- ---------------------------------------------------------------------------
create table if not exists calendar_year_content (
  id              uuid primary key default gen_random_uuid(),
  year            int not null unique,
  theme           text not null default '',
  verse_text      text not null default '',
  verse_reference text not null default '',
  source_locale   text not null default 'en',
  admin_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table calendar_year_content is
  'One theme and memory verse per year, rendered above the calendar grid on every month of that year. The per-month freeform note stays on calendar_month_notes. See migration 000018.';
comment on column calendar_year_content.verse_text is
  'The memory verse, plain text. NEVER machine translated - a model asked to translate scripture returns a paraphrase, not the published wording a congregation memorises. Its other-language wording arrives as a human-authored translation row. See migration 000017 and service.monthNoteTranslatableFields.';

-- ---------------------------------------------------------------------------
-- 2. Carry existing content forward.
--
-- Written generally rather than hard-coding the one row production happens to
-- have today (2026-10, "Priority" / Matthew 6:33). If a second month gets
-- filled in before this ships, DISTINCT ON picks the most recently edited one
-- for that year, which is the best available answer - the month grain simply
-- holds more information than the year grain, so something has to give.
--
-- Trailing whitespace is carried verbatim. The owner's stored theme is
-- 'Priority ' with a trailing space; silently rewriting authored text during a
-- structural migration is not this file's business.
-- ---------------------------------------------------------------------------
insert into calendar_year_content (year, theme, verse_text, verse_reference, source_locale, admin_id)
select distinct on (mn.year)
       mn.year, mn.theme, mn.verse_text, mn.verse_reference, mn.source_locale, mn.admin_id
  from calendar_month_notes mn
 where btrim(mn.theme) <> '' or btrim(mn.verse_text) <> '' or btrim(mn.verse_reference) <> ''
 order by mn.year, mn.updated_at desc
on conflict (year) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Carry the translations with it.
--
-- This is the part worth getting right. Production already holds AI Vietnamese
-- for the theme ('Ưu tiên') and the reference ('Ma-thi-ơ 6:33'), neither
-- approved yet. Deleting and re-enqueueing would discard work a human is
-- partway through reviewing and pay for the model to redo it, so the rows are
-- re-pointed at the new record with approved_by untouched.
--
-- Only the translations belonging to the row that was actually copied move. A
-- UNIQUE (record_id, field_name, locale) means two months in one year both
-- carrying a 'theme' translation would collide on the single year row, so the
-- CTE picks exactly the same row clause 2 did.
-- ---------------------------------------------------------------------------
with chosen as (
  select distinct on (mn.year) mn.id as note_id, mn.year
    from calendar_month_notes mn
   where btrim(mn.theme) <> '' or btrim(mn.verse_text) <> '' or btrim(mn.verse_reference) <> ''
   order by mn.year, mn.updated_at desc
)
update translations t
   set table_name = 'calendar_year_content',
       record_id  = yc.id
  from chosen c
  join calendar_year_content yc on yc.year = c.year
 where t.table_name = 'calendar_month_notes'
   and t.record_id  = c.note_id
   and t.field_name in ('theme', 'verse_text', 'verse_reference');

-- Anything still filed against a month note for these three fields translates
-- text that clause 5 is about to drop - a theme that was set, translated, then
-- cleared, or a month that lost the DISTINCT ON tie. Left in place it would sit
-- in the review panel forever offering Vietnamese for a column that no longer
-- exists, and the orphan sweep would never collect it because it matches on the
-- PARENT row being gone and calendar_month_notes survives. Same trap as the one
-- documented in docs/agents/known-quirks.md for cleared note text.
delete from translations
 where table_name = 'calendar_month_notes'
   and field_name in ('theme', 'verse_text', 'verse_reference');

-- Pending queue rows are transient - the worker drains them in about five
-- seconds - so they are stripped rather than re-pointed. The translation they
-- would have produced has already been carried across above, and the next save
-- re-enqueues anything genuinely missing. A job that also carries `content`
-- keeps its content key: that field is not moving and its translation is none
-- of this migration's business.
update translation_jobs
   set fields = fields - 'theme' - 'verse_text' - 'verse_reference'
 where table_name = 'calendar_month_notes'
   and status = 'pending';

delete from translation_jobs
 where table_name = 'calendar_month_notes'
   and status = 'pending'
   and fields = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 4. Only now drop the columns - clause 2 reads them.
-- ---------------------------------------------------------------------------
alter table calendar_month_notes
  drop column if exists verse_reference,
  drop column if exists verse_text,
  drop column if exists theme;
