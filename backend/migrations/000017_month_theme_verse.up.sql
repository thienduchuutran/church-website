-- 000017_month_theme_verse.up.sql
-- Give each month a theme and a memory verse, on the row that already exists.
--
-- The obvious shape was a new month_content table. It was rejected because
-- calendar_month_notes is ALREADY keyed (year, month) - the exact same key - so
-- a second table would mean two upserts, two reads and two null-checks for one
-- concept, plus a second registration in all five places the translation engine
-- knows about calendar_month_notes (the label CASE and the LEFT JOIN in
-- repository/translation.go, the orphan-sweep clause below them, the enqueueOne
-- call in service/calendar.go, and the review panel's tint in the frontend).
--
-- The note editor's placeholder has read "Write a monthly note, address, theme
-- verse..." since it shipped, which is the real tell: this content was already
-- being typed into the one freeform box. What changes here is that it gets
-- columns of its own, so it can be ranked, styled and translated separately
-- instead of arriving as one undifferentiated blob.
--
-- What we accept in exchange: one source_locale column now covers four text
-- fields rather than one, so a note whose theme is Vietnamese and whose verse
-- is English is detected as whichever language dominates the combined text.
-- That is already the established trade - calendar_events has shared one
-- source_locale across title and notes since migration 000013 - and the
-- alternative (a locale per field) would make the flip-cleanup logic in
-- service/calendar.go four times as wide for a case nobody has hit.
--
-- Written idempotently - safe on an unseeded dev DB and on prod.

-- ---------------------------------------------------------------------------
-- The three columns.
--
-- `not null default ''` deliberately mirrors the existing `content` column
-- rather than allowing NULL. It keeps "this month has no verse" as exactly one
-- representable state instead of two, which matters because the read path in
-- GetMonthNote resolves each field through a COALESCE against its translation:
-- with NULLs in play, COALESCE(translation, stored) would silently promote a
-- stale translation over a field the admin had just cleared. Empty string has
-- no such ambiguity - it is a value, and it wins.
--
-- No backfill is needed or wanted: every existing row lands on the default and
-- is immediately valid. That matters more here than in most projects, because
-- migrations auto-apply on backend startup - a migration that needs a data fix
-- to validate is a failed deploy, not a failed test.
--
-- verse_reference is stored separately from verse_text rather than being
-- expected at the end of the verse, so the two can be styled apart (the
-- reference is the part a reader looks up) and, more importantly, so the
-- translation worker sees them as separate fields. A reference is a proper
-- noun plus digits - "1 Thessalonians 5:18" becomes "1 Te-sa-lo-ni-ca 5:18" -
-- and leaving it embedded in the verse would give the model licence to
-- reformat the numbers while rewriting the sentence around them.
-- ---------------------------------------------------------------------------
alter table calendar_month_notes
  add column if not exists theme           text not null default '',
  add column if not exists verse_text      text not null default '',
  add column if not exists verse_reference text not null default '';

comment on column calendar_month_notes.theme is
  'The month''s theme, a short phrase. Rendered above the calendar grid, not in the info strip below it. Empty string means unset. See migration 000017.';
comment on column calendar_month_notes.verse_text is
  'The month''s memory verse, plain text - never HTML, so it does not go near sanitizeBody. Empty string means unset. See migration 000017.';
comment on column calendar_month_notes.verse_reference is
  'The verse citation, e.g. ''1 Thessalonians 5:18''. Separate from verse_text so the translation worker treats it as its own field rather than reformatting digits inside a sentence. See migration 000017.';
