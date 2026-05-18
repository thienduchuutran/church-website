-- Translation engine schema.
--
-- Three tables power async EN -> VI translation for dynamic content:
--   translations      stores translated text (the cache + the served output)
--   system_prompts    stores the AI system prompt, loaded at runtime by the Go worker
--   translation_jobs  is the queue the worker polls every few seconds
--
-- Content reference is generic (table_name + record_id) so the same pipeline
-- can translate posts, page_content, and calendar_events without schema changes.
-- No FK to source tables on purpose: translations survive content moves and
-- decouple from the source table's lifecycle. Orphan cleanup runs out-of-band.
--
-- No auth.users FK on approved_by - matches the admin_id convention on posts
-- and calendar_events (see docs/agents/database.md, "Posting fails with
-- posts_admin_id_fkey" quirk). Authorization is enforced in Go middleware.

create table translations (
  id              uuid primary key default gen_random_uuid(),
  table_name      text not null,
  record_id       uuid not null,
  field_name      text not null,
  locale          text not null,
  source_hash     text not null,
  source_text     text not null,
  translated_text text not null,
  is_ai_generated boolean not null default true,
  approved_by     uuid,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (record_id, field_name, locale)
);

create index on translations (table_name, record_id, locale);
create index on translations (source_hash, locale);

create table system_prompts (
  key        text primary key,
  content    text not null,
  version    text not null,
  updated_at timestamptz not null default now()
);

create table translation_jobs (
  id             uuid primary key default gen_random_uuid(),
  table_name     text not null,
  record_id      uuid not null,
  fields         jsonb not null,
  target_locales text[] not null,
  content_type   text not null default 'general',
  status         text not null default 'pending',
  error          text,
  attempts       int not null default 0,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);

-- Partial index: the worker only ever queries pending jobs, and this keeps
-- the index small as done/failed rows accumulate.
create index on translation_jobs (status, created_at) where status = 'pending';

-- Seed the Vietnamese translation system prompt.
-- ON CONFLICT DO NOTHING so re-running on an existing DB (or running the
-- sync-prompt.sh script first) does not clobber a newer version.
-- TODO: replace [CHURCH NAME] with the actual church name before running.
insert into system_prompts (key, content, version) values (
  'vi_translation',
  'You are an intepretor and translator for VGOMNE, Vietnamese Gospel Outrach Ministry New England, a Vietnamese-American Christian and
Missionary Alliance (CMA) congregation in Saugus, Massachusetts.

DIALECT: Southern Vietnamese (Nam Bộ / Saigon register)
REGISTER: Warm, communal, and reverent - like a trusted elder speaking to family.
Not stiff or academic. Not overly casual.

THEOLOGICAL VOCABULARY (use these exact terms, never alternatives):
- God -> Chúa (not Thiên Chúa, not Đức Chúa Trời unless directly quoting scripture)
- Church / congregation -> Hội thánh (never nhà thờ)
- Worship service -> buổi thờ phượng
- Fellowship -> thông công
- Pastor -> Mục sư [Name] - keep title + name, do not translate names
- Pray / prayer -> cầu nguyện
- Scripture / Bible -> Kinh Thánh
- Sunday school -> trường Chúa nhật
- Youth group -> nhóm thanh niên
- Offering -> dâng hiến

RULES:
- Preserve all proper nouns, names, and dates exactly as written
- Preserve HTML tags if present in the source - only translate the text content
- Do not add information not in the source
- Do not remove information from the source
- Match the length and paragraph structure of the original closely
- For event announcements: keep tone warm and inviting

OUTPUT: Return ONLY the translated text. No preamble, no explanation, no quotes.',
  '1.0.0'
) on conflict (key) do nothing;
