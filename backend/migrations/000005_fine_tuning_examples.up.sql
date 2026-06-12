-- Fine-tuning data capture.
--
-- Every admin approval/edit on /admin/translations is a free gold training
-- pair: the English source plus the Vietnamese text a bilingual human signed
-- off on. This table accumulates those pairs so a LoRA fine-tune of an
-- open-source model can be trained later (see docs/FINE_TUNING_PLAN.md).
-- Capture is fire-and-forget from the service layer; nothing in the existing
-- translation engine reads this table.
--
-- No FK to translations or the source tables, matching the translations-table
-- convention: a training pair must survive the parent record being edited or
-- deleted - the pair was valid human output at the moment of approval.
-- No FK on approved_by for the same reason as posts.admin_id (JWT sub stored
-- as plain text, auth.users lives in a Supabase-managed schema).
--
-- locale is intentionally absent: the engine is EN -> VI only today
-- (SUPPORTED_LOCALES defaults to 'vi'). If more locales ship, add a locale
-- column and fold it into the unique index in a follow-up migration.

create table if not exists fine_tuning_examples (
  id               uuid primary key default gen_random_uuid(),
  source_en        text not null,
  approved_vi      text not null,
  content_type     text not null check (content_type in ('general', 'pastoral')),
  source_field     text not null,        -- 'title', 'body', 'content', 'notes', ...
  record_table     text not null,        -- 'posts', 'page_content', 'calendar_events', ...
  record_id        uuid not null,        -- which record this came from
  approved_by      text not null,        -- JWT sub of the admin who approved it
  approved_at      timestamptz not null default now(),
  used_in_training boolean not null default false,
  training_run_id  text,                 -- set when a training job consumes this pair
  created_at       timestamptz not null default now()
);

-- The exporter only ever scans unused pairs; the partial index stays small as
-- consumed rows accumulate (same trick as the pending-jobs index on
-- translation_jobs).
create index on fine_tuning_examples (used_in_training)
    where used_in_training = false;

-- Deduplication: one captured pair per (record, field). The repository inserts
-- with ON CONFLICT DO NOTHING against this index, so approving the same
-- translation twice is a silent no-op.
create unique index on fine_tuning_examples (record_id, source_field, record_table);
