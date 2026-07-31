# docs/agents/database.md - Database Reference

## Engine
Supabase Postgres (project `glcnqlffktqxaizdverk`, region `aws-us-east-1`).
The Go backend connects via `pgx` through Supabase's **session pooler**:
`postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`.
The frontend never touches the database directly - all reads and writes go through the Go backend.

The session pooler (not the transaction pooler on port 6543, and not the direct connection which is IPv6-only) is the right choice for `pgxpool`'s long-lived connections from Render. SSL is required.

---

## Tables

### `admins`
Whitelist of people allowed to access the admin panel.
```sql
create table admins (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique not null,   -- must match Google account email exactly
  display_name       text,
  discord_user_id    text,                   -- Discord snowflake; set by the "Link Discord" OAuth flow (000006)
  discord_username   text,                   -- Discord handle, shown as the message sender
  discord_avatar_url text,                   -- cdn.discordapp.com avatar URL, built at link time from id + avatar hash
  created_at         timestamptz default now()
);
```
> To add the first admin: connect via psql and `INSERT INTO admins (email) VALUES ('you@example.com');`
> The `discord_*` columns (migration `000006`) are nullable and filled by the one-time Discord link flow. When null, a post falls back to the admin's `display_name` + a default church avatar. See `docs/agents/discord.md` → "Per-admin identity".

---

### `posts`
All content on the site - events, announcements, bible studies, playlists, gallery albums.
```sql
create type post_type as enum (
  'event', 'announcement', 'bible_study', 'playlist', 'gallery_album'
);

create table posts (
  id                  uuid primary key default gen_random_uuid(),
  type                post_type not null,
  title               text not null,
  body                text,
  event_date          timestamptz,
  external_link       text,
  admin_id            uuid,          -- JWT sub claim from Supabase Auth; no FK (auth.users lives in Supabase)
  discord_message_id  text,          -- id Discord returns on send (?wait=true); edit/delete target this message (000006)
  discord_channel_key text,          -- env var name of the webhook used, e.g. 'DISCORD_WEBHOOK_EVENTS'; edit/delete reuse it
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  archived_at         timestamptz    -- set when an admin moves an event into the "Past" section; null = not archived (000007)
);
```
> `archived_at` (migration `000007`) is null until an admin manually moves an event into the website's "Past Events" section. An event renders as Past when `archived_at` is set **OR** its `event_date` has already passed; a dateless event stays in "Upcoming" until archived. See `docs/agents/known-quirks.md` → "Dateless events never appeared in the homepage Upcoming list".
> `discord_message_id` / `discord_channel_key` (migration `000006`) are nullable - they stay null until a post is delivered to Discord (delivery is best-effort). They let the site edit/delete the exact same Discord message it originally sent, through the exact same webhook, even if the post-type→channel mapping later changes. See `docs/agents/discord.md`.

**Type usage guide:**
| type | title | body | event_date | external_link |
|------|-------|------|------------|---------------|
| event | event name | description | optional (dateless = "Upcoming" until archived) | optional |
| announcement | subject | full message | null | null |
| bible_study | lesson title | optional notes | null | Google Slides/Docs URL |
| playlist | event/retreat name | null | null | Spotify URL |
| gallery_album | album name | optional caption | null | optional Drive link |

---

### `post_images`
Images attached to any post.
```sql
create table post_images (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  storage_key   text not null,       -- R2 object key, e.g. "images/posts/{post_id}/{unixnano}.jpg"
  display_order int default 0,
  created_at    timestamptz default now()
);
```
> `storage_key` is the R2 object key, not a full URL. The Go backend mints a fresh presigned URL on every read.
> Bucket: `church-uploads-prod` on Cloudflare R2 (private, accessed via static R2 keys stored in Render env).

---

### `reactions`
One row per reaction. The unique constraint enforces one reaction per viewer per post.
```sql
create table reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '🙏', '😂')),
  fingerprint text not null,
  created_at  timestamptz default now(),
  unique (post_id, fingerprint)
);
```
> Fingerprint abuse (spam reactions) is rate-limited in the Go service layer, not at the DB level.

---

### `page_content`
Editable content blocks for static pages (about, connect). After migration `000011`, each row
is a typed, ordered block with its own heading (`title`) and body (`content`).
```sql
create table page_content (
  id          uuid primary key default gen_random_uuid(),
  page_slug   text not null,
  section_key text not null,        -- human-readable slug, immutable after creation (identity is the UUID)
  block_type  text not null default 'rich_text',  -- discriminant: 'hero', 'rich_text', 'quote'
  position    int  not null default 0,            -- display order within the page
  title       text not null default '',           -- block heading (was a separate *_heading row)
  content     text not null default '',           -- block body (HTML for rich_text/quote, plain for hero)
  props       jsonb not null default '{}'::jsonb, -- type-specific config (never prose, never translated)
  updated_at  timestamptz default now(),
  unique (page_slug, section_key)
);
create index idx_page_content_slug_position on page_content(page_slug, position);
```
> `block_type` is validated server-side against `model.AllowedBlockTypes` (`hero`, `rich_text`, `quote`). The default `'rich_text'` keeps existing rows valid without a backfill.
> `title` + `content` are both translatable fields. The COALESCE joins in `GetBlocks` join `translations` twice (once for `field_name='title'`, once for `field_name='content'`).
> `props` is the escape hatch for future block types - new types need no migration, just a new registry entry. Never contains prose; the translation worker never sees it.
> Migration `000011` backfills About's old `*_heading` + `*_body` pairs into single block rows, re-points translations, and merges `values_item_1..4` into one `<ul>` block.

---

### `calendar_events`
One row per calendar entry on a specific date.
```sql
create table calendar_events (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  end_date     date,                            -- inclusive last day of a multi-day span
  title        text not null,
  event_type   text not null default 'general'  -- FK -> calendar_event_types(slug)
                 references calendar_event_types(slug)
                 on update cascade on delete restrict,
  icon         text not null default 'star',    -- a curated Phosphor key, or 'none'
  color        text not null default 'slate',   -- a palette key OR a 6-digit hex
  private_address text,
  address_public  boolean not null default false,
  place_id     uuid references calendar_places(id) on delete set null,
  notes        text,
  admin_id     uuid,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
```

> `place_id` (migration `000014`) is the resolved venue behind `private_address`. The two coexist on purpose: `private_address` stays the source of truth for what this event's admin typed and is what `address_public` gates, while `place_id` answers "which venue is that" so the Locations strip can group. Nullable and never backfilled - pre-`000014` events render address-only until they are next saved.

> **`event_type` was a Postgres enum until migration `000012`.** That was the actual blocker on admin flexibility - an enum only gains values through a migration, so "add a category" could never be a runtime action. It is now `text` with a foreign key, which keeps referential integrity while letting an `INSERT` into `calendar_event_types` create a legal value at runtime.
>
> The `calendar_event_type` enum **type** is deliberately left in place (unused) so the down migration has something to cast back to. Do not drop it.
>
> Two easy traps: any SQL casting this column must use `$n::text`, **not** `$n::calendar_event_type` (this bit `repository/calendar.go`'s `UpdateEvent`), and the seed of `calendar_event_types` must run *before* the FK is added or every existing row fails the constraint.

---

### `calendar_places`
The venue registry behind the calendar's Locations strip. Added in migration `000014`.
```sql
create table calendar_places (
  id          uuid primary key default gen_random_uuid(),
  address_key text not null unique,          -- normalized address = the identity
  address     text not null,                 -- as typed, for display
  name        text not null,                 -- 'Church', 'Chris & Sebs'
  name_source text not null default 'ai'     -- 'ai' | 'admin'
                check (name_source in ('ai', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

**Why a table and not a column on the event.** A place name is a function of its address - two different places cannot share one - so `101 Main St` is "Church" no matter which event mentions it. Keying on the address makes dedupe structural (a group-by on `place_id`) instead of a string comparison redone on every render, and it means the name is worked out **once per address for the life of the church** rather than once per event.

`address_key` carries the `unique` constraint and is written by `model.NormalizeAddressKey` (case folded, diacritics stripped, punctuation dropped, `St`/`Street` and `MA`/`Massachusetts` collapsed). An admin who types the same address two different ways still lands on one row. It is never displayed - `address` is what gets printed.

`name` is proposed by Gemini through the `place_name` system prompt (see `docs/agents/backend.md` → "Place naming"), which is why `name_source` exists: the naming worker only ever writes over an `'ai'` row, so an admin rename is permanent and cannot be silently undone by a later model call.

---

### `calendar_event_types`
The admin-managed event-type vocabulary. Added in migration `000012`; before that this list lived in a Postgres enum plus a hardcoded `switch` in Go and a `Record` in TypeScript.
```sql
create table calendar_event_types (
  slug          text primary key,               -- 'birthday', 'baptism', ...
  label         text not null,                  -- 'Birthday', 'Baptism'
  default_icon  text not null default 'star',
  default_color text not null default 'slate',
  is_builtin    boolean not null default false,
  sort_order    int not null default 100,       -- built-ins 10-60, admin-created 100
  admin_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```
Seeded with the six built-ins (`birthday`, `bible_study`, `general`, `announcement`, `prayer`, `graduation`) carrying the icon/color pairs that were previously hardcoded in `EventModal.handleTypeChange`.

`default_icon` / `default_color` are what makes an admin-created type feel designed from its first use - the look travels with the type row rather than living in the component.

`is_builtin` marks the six the **application code still branches on**: `event_type === 'birthday'` drives the cake marker, the two-row cell budget in `CalendarGrid`, and the Birthdays sidebar strip. A custom type never inherits that layout behaviour, only its icon and color.

The `slug` is derived server-side by `model.SlugifyEventType` (diacritics folded, so `"Lễ Báp-têm"` → `le_bap_tem`) and inserted with `ON CONFLICT DO UPDATE ... RETURNING`, making creation **get-or-create**.

---

### `calendar_palette_colors`
The shared custom color swatches for the event color picker. Added in migration `000012`.
```sql
create table calendar_palette_colors (
  id         uuid primary key default gen_random_uuid(),
  hex        text not null unique check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int not null default 0,
  admin_id   uuid,
  created_at timestamptz not null default now()
);
```
Swatches are deliberately **unnamed** - the color is its own label (GoodNotes' model, not Outlook categories).

**The `CHECK` is a security backstop, not hygiene.** This value is rendered into an inline `style` attribute on the public calendar, so the regex is the DB-level layer of the same defence as `model.IsAllowedCalendarColor` in Go.

**Events store color by value, not by reference.** There is no FK from `calendar_events.color` to this table - an event holds the literal hex. That is why deleting a swatch only shrinks the picker and never repaints an existing event.

---

### `calendar_month_notes`
One sidebar note per month - displayed in the 30% right panel of the calendar.
```sql
create table calendar_month_notes (
  id         uuid primary key default gen_random_uuid(),
  year       int not null,
  month      int not null check (month between 1 and 12),
  content    text not null default '',
  admin_id   uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (year, month)
);
```

---

### `calendar_month_settings`
Per-month admin styling for the interactive calendar. Currently just an accent
color (hex string). Optional - when no row exists, the frontend falls back to
the static `MONTH_THEMES` palette in `frontend/components/features/calendar/types.ts`.
```sql
create table calendar_month_settings (
  id           uuid primary key default gen_random_uuid(),
  year         int not null,
  month        int not null check (month between 1 and 12),
  accent_color text not null,                                   -- hex string e.g. '#C4663C'
  admin_id     uuid,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (year, month)
);
```

---

## Translation tables

Three tables back the async translation engine. They are populated by the Go backend's `internal/translation/` worker; the frontend never writes to them directly. Schema source: `backend/migrations/000004_translations.up.sql`, extended by `000013_source_locale.up.sql`.

### Direction is data, not policy (migration `000013`)

The engine was originally EN → VI only, and that assumption was baked in three places: the source column *was* English by definition, `translations.locale` could only be `'vi'`, and `Translator.TranslateField` early-returned on an English target. Migration `000013` replaced the assumption with a column.

**`source_locale`** on `calendar_events`, `calendar_month_notes`, and `translation_jobs` records which language that row's own text columns are written in. `'en'` for everything authored before the migration - correct, because the old code path could not have produced anything else.

Consequences worth knowing before touching any of this:

| | Before `000013` | After |
|---|---|---|
| Source language | Always English | Per row, in `source_locale` |
| `translations.locale` | Always `'vi'` | `'vi'` **or** `'en'` (a reverse-direction row) |
| Read path | `if locale != 'en'` → join | `CASE WHEN source_locale = $viewer THEN own column ELSE COALESCE(translation, own column) END` |
| System prompts | One row, `vi_translation` | Two: `vi_translation` and `en_translation` |
| Empty locale on read | Meant "English" | Means **raw stored text**, no translation - internal callers only |

**The two-column pairing.** A localized read returns both the translated text *and* the authored text (`title_source` / `notes_source` / `content_source`), because the calendar is one page doing two jobs: display for everyone, editing for admins. The display fields follow the viewer's locale; the `_source` fields are what the edit form pre-fills, so a save always writes the source and never overwrites it with a machine translation. The `_source` fields are admin-only and stripped in `handler/calendar.go`.

**Language flips purge.** `source_locale` can change - an admin rewrites an English event in Vietnamese. The translation into the *new* source language is then redundant with the record itself, and would sit in the review queue showing the same language on both sides of the diff. `CalendarRepository.DeleteTranslationsForLocale` removes it, and unlike `DeleteUnapproved` it ignores approval status: a human-approved Vietnamese translation of text that is now itself Vietnamese is a leftover, not a reviewer edit worth protecting.

**Phase A only.** `posts` and `page_content` still carry an implicit English source. That is safe to leave - `'en'` plus the direction-aware read path reproduce the old behavior exactly. Converting them means adding `source_locale`, calling `resolveSourceLocale` on their write paths, and flipping their COALESCE joins to the `CASE` form above; do all three together, or rows get relabelled while the serving layer still ignores the label.

### `translations`
Stores every translated field for every record across every locale. Generic by design: a single table serves posts, page_content, and calendar_events.
```sql
create table translations (
  id              uuid primary key default gen_random_uuid(),
  table_name      text not null,                  -- 'posts' | 'page_content' | 'calendar_events' | 'calendar_month_notes'
  record_id       uuid not null,                  -- the source row's UUID
  field_name      text not null,                  -- 'title' | 'body' | 'content' | 'notes'
  locale          text not null,                  -- TARGET locale: 'vi', or 'en' for a reverse-direction row (000013)
  source_hash     text not null,                  -- sha256(trimmed source). Cache key.
  source_text     text not null,                  -- audit trail: what we translated from
  translated_text text not null,
  is_ai_generated boolean not null default true,
  approved_by     uuid,                           -- JWT sub of bilingual admin who approved/edited
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (record_id, field_name, locale)
);
create index on translations (table_name, record_id, locale);  -- the read-path COALESCE join
create index on translations (source_hash, locale);            -- the cache lookup
```

**Why no FK on `record_id`:** translations are referenced across multiple parent tables (`posts`, `page_content`, ...). A FK would couple this table to a single parent or require a polymorphic FK trick. Orphans are cleaned up out-of-band: the "Clean up orphans" button on `/admin/translations` (POST `/api/v1/admin/translations/cleanup-orphans`) sweeps rows whose parent is gone. Only the four known `table_name` values are swept - unknown names are left intact so a future content type can't be clobbered before the sweep list learns about it.

**Why no FK on `approved_by`:** same convention as `posts.admin_id` and `calendar_events.admin_id` - JWT `sub` claims stored as plain uuid, no FK to `auth.users`. Project sidesteps the Supabase auth schema in application migrations (see "Posting fails with `posts_admin_id_fkey`" in `docs/agents/known-quirks.md`).

**The `approved_by = NULL` reset:** the upsert in `Translator.upsertTranslation` resets `approved_by` and `approved_at` to `NULL` when the source hash changes. Intended: a human approval applies to the exact text it was for. New source text → fresh AI translation, fresh approval required.

### `system_prompts`
Holds the AI system prompt by key. The Go worker reads `vi_translation` at startup and refreshes from this table every 5 minutes (in-memory cache in `PromptCache`).
```sql
create table system_prompts (
  key        text primary key,                    -- 'vi_translation'
  content    text not null,                       -- the full prompt body (theological vocabulary + rules)
  version    text not null,                       -- '1.0.0', '1.1.0', ...
  updated_at timestamptz not null default now()
);
```

**Editing flow:** edit `prompts/vi_translation_system_prompt.md` in the repo, run `./scripts/sync-prompt.sh <new-version>` to upsert into Supabase, and the running backend picks up the change within ~5 minutes (cache TTL) - no redeploy. See Phase 6 of the original spec.

### `translation_jobs`
Job queue polled by the worker. One row per (record, target locales) pair. The worker claims rows with `FOR UPDATE SKIP LOCKED` so multiple backend instances can run safely.
```sql
create table translation_jobs (
  id             uuid primary key default gen_random_uuid(),
  table_name     text not null,
  record_id      uuid not null,
  fields         jsonb not null,                  -- {"title": "<source>", "body": "<source>"}
  target_locales text[] not null,                 -- {'vi'}
  content_type   text not null default 'general', -- always 'general' (the 'pastoral'/Claude tier was removed 2026-07; column kept for future types)
  status         text not null default 'pending', -- 'pending' | 'processing' | 'done' | 'failed'
  error          text,
  attempts       int not null default 0,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);
create index on translation_jobs (status, created_at) where status = 'pending';  -- the worker's only query
```

**Lifecycle:** content handler inserts `pending` → worker SELECT FOR UPDATE flips to `processing` and bumps `attempts` → on success becomes `done`, on error becomes `pending` again (retry) or `failed` after 3 attempts.

**Why no FK on `record_id`:** same reason as `translations` - the queue serves multiple parent tables. By the time the worker drains a stale row, the parent record may already have been deleted; the worker tolerates this and the row stays as audit history. The orphan sweep (POST `/api/v1/admin/translations/cleanup-orphans`) deletes `pending` jobs whose parent is gone - otherwise the worker would re-create a just-swept orphan translation - but leaves `done`/`failed` rows as audit history.

### `fine_tuning_examples`
Gold (English source, approved Vietnamese) training pairs for a future fine-tuned translation model (see `docs/FINE_TUNING_PLAN.md`). Populated fire-and-forget by `TranslationService.Approve` whenever a bilingual admin approves or edits a translation. Nothing in the serving path reads this table - it is purely a dataset accumulator. Schema source: `backend/migrations/000005_fine_tuning_examples.up.sql`.
```sql
create table if not exists fine_tuning_examples (
  id               uuid primary key default gen_random_uuid(),
  source_en        text not null,        -- the English the AI translated from
  approved_vi      text not null,        -- the Vietnamese as finalized by the human
  content_type     text not null check (content_type in ('general', 'pastoral')),  -- only 'general' is ever written; 'pastoral' allowed by the applied migration but unused since 2026-07
  source_field     text not null,        -- 'title', 'body', 'content', 'notes', ...
  record_table     text not null,        -- 'posts', 'page_content', ...
  record_id        uuid not null,
  approved_by      text not null,        -- JWT sub of the approving admin
  approved_at      timestamptz not null default now(),
  used_in_training boolean not null default false,
  training_run_id  text,                 -- set when a training run consumes the pair
  created_at       timestamptz not null default now()
);
create index on fine_tuning_examples (used_in_training) where used_in_training = false;  -- exporter scan
create unique index on fine_tuning_examples (record_id, source_field, record_table);     -- dedup target for ON CONFLICT
```

**Why no FK anywhere:** same convention as `translations` - a training pair must survive its parent record being edited or deleted; it was valid human output at the moment of approval. `approved_by` follows the `posts.admin_id` no-FK convention.

**Export:** `python scripts/export_training_pairs.py` writes `used_in_training = FALSE` rows as SFTTrainer JSONL into `fine_tuning_data/` (gitignored). The script never flips `used_in_training` - that is the future training pipeline's job.

---

## Relationships
```
posts       ──< post_images   (one post has many images)
posts       ──< reactions     (one post has many reactions)
```
`admin_id` on posts and calendar_events stores the Supabase Auth user UUID (JWT `sub` claim). No FK on this column - Supabase Auth's `auth.users` table is in a different schema managed by Supabase, and we deliberately do not couple the application schema to it. See `docs/agents/known-quirks.md` → "Posting fails with `posts_admin_id_fkey`" for the time someone added the FK by mistake and broke writes.

---

## Indexes
```sql
create index on posts(type);
create index on posts(created_at desc);
create index on posts(event_date) where event_date is not null;
create index posts_archived_at_idx on posts(archived_at) where archived_at is not null;  -- the Past-section read path
create index on post_images(post_id);
create index on reactions(post_id);
create index on page_content(page_slug);
create index idx_page_content_slug_position on page_content(page_slug, position);
create index on calendar_events(date);
create index on calendar_events(date, event_type);
create index on calendar_month_notes(year, month);
create index on calendar_month_settings(year, month);
```

---

## Access control (current state)
RLS is **not yet enabled**. The Go backend connects as a single DB user with full access.
Authorization is enforced at the application layer by the `RequireAdmin` middleware in Go.
See `docs/agents/database.md` → "RLS proposal" section for a plan to add DB-level enforcement.

---

## R2 file storage
- **Bucket**: `church-uploads-prod` (Cloudflare R2, S3-compatible API)
- **Endpoint**: `https://<account-id>.r2.cloudflarestorage.com` (set as `S3_ENDPOINT` on Render)
- **Region**: `auto` - R2 has no regions; this placeholder satisfies the AWS SDK
- **Access**: fully private. No public URLs. Access via static R2 access key + secret stored in Render env. R2 does not have IAM roles.
- **Path convention**: `{post_id}/{filename}` for images, `videos/hero/{id}.mp4` for hero videos.
- **Go layer**: `backend/internal/storage/s3.go` - `UploadFile`, `DeleteFile`, `PresignedURL`. The same code works against AWS S3 or R2; the only difference is the `endpoint` parameter passed to `NewS3Client`.
- **Path-style URLs required**: when `endpoint != ""`, the code sets `o.UsePathStyle = true` on the SDK client. R2 does not honor virtual-hosted-style URLs.
- Admin uploads go through the Go backend (`POST /api/v1/posts/:id/images`), not directly to R2 from the browser.

---

## Migration files
Schema changes live in `backend/migrations/` as numbered `<NNNNNN>_<description>.up.sql` / `.down.sql` pairs. This folder is the **source of truth**; the files are embedded into the Go binary via `embed.go` and applied on backend startup by `runMigrations` in `backend/cmd/server/main.go` using `github.com/golang-migrate/migrate/v4`. golang-migrate tracks applied migrations in `public.schema_migrations`.

Current files:
```
backend/migrations/
├── 000001_initial_schema.up.sql        ← all tables, enums, indexes
├── 000001_initial_schema.down.sql
├── 000002_hero_video_visibility.up.sql ← alter hero_videos add column is_visible
├── 000002_hero_video_visibility.down.sql
├── 000003_gallery_tags.up.sql          ← tags + post_tags join table
├── 000003_gallery_tags.down.sql
├── 000004_translations.up.sql          ← translations + system_prompts + translation_jobs (seeds vi_translation prompt)
├── 000004_translations.down.sql
├── 000005_fine_tuning_examples.up.sql  ← fine_tuning_examples (gold pairs captured on translation approval)
├── 000005_fine_tuning_examples.down.sql
├── 000006_discord_identity.up.sql      ← admins += discord_*; posts += discord_message_id/channel_key
├── 000006_discord_identity.down.sql
├── 000007_post_archived_at.up.sql      ← posts += archived_at (+ partial index) for the Past-events section
├── 000007_post_archived_at.down.sql
├── 000008_calendar_event_end_date.up.sql  ← calendar_events += end_date for multi-day spans
├── 000008_calendar_event_end_date.down.sql
├── 000009_calendar_event_type_graduation.up.sql  ← adds 'graduation' to calendar_event_type enum
├── 000009_calendar_event_type_graduation.down.sql
├── 000010_calendar_event_address_public.up.sql  ← calendar_events += private_address visibility (address_public bool)
├── 000010_calendar_event_address_public.down.sql
├── 000011_page_blocks.up.sql           ← page_content += block_type, position, title, props; backfills About heading/body pairs into blocks
├── 000011_page_blocks.down.sql
├── 000012_calendar_flexible_types_and_palette.up.sql  ← calendar_event_types + calendar_palette_colors; event_type enum → text + FK
├── 000012_calendar_flexible_types_and_palette.down.sql
├── 000013_source_locale.up.sql         ← posts/calendar_events/calendar_month_notes/translation_jobs += source_locale (seeds en_translation prompt)
├── 000013_source_locale.down.sql
├── 000014_calendar_places.up.sql       ← calendar_places + calendar_events.place_id (seeds place_name prompt)
├── 000014_calendar_places.down.sql
└── embed.go                            ← exposes the SQL files as embed.FS to main.go
```

### Adding a new migration
1. Create both files in `backend/migrations/`:
   - `000003_<short_description>.up.sql` - the change.
   - `000003_<short_description>.down.sql` - the inverse, so `migrate down` works in dev.
2. Write plain PostgreSQL only. Avoid Supabase-specific syntax (`auth.jwt()`, `auth.users` FKs, RLS policies). The rationale: `runMigrations` runs as part of Go startup against any `DATABASE_URL`, including local Docker Postgres which has no `auth.users` schema. Authorization is enforced at the application layer via `RequireAdmin` middleware in Go, not at the DB layer.
3. Commit and push. On the next backend deploy, golang-migrate sees the new version in `embed.FS`, compares against `public.schema_migrations`, and runs the up-migration. `migrate.ErrNoChange` is treated as success on subsequent boots.

### One-off SQL outside the migration system
For exploratory queries, reading data, or true emergency hotfixes use the Supabase dashboard SQL editor (Project → SQL Editor). If a hotfix changes the schema, follow up immediately with a normal `backend/migrations/` file so the next fresh database (local dev, staging) reaches the same state.

### `supabase/migrations/` is not used
The `supabase/migrations/` folder holds five files (`001_*` through `20260506_*`) from the original Supabase project setup, before the RDS detour. They carry "LEGACY" headers from when the database was on plain Postgres; the headers are factually outdated now that Supabase is back in front, but the operative instruction (`do not re-apply`) still stands - most of the tables they create are also created by `backend/migrations/000001_initial_schema.up.sql`, so re-applying would conflict. Treat the folder as historical record only.

### Other historical files
- `scripts/rds-schema.sql` - one-shot bootstrap snapshot from the RDS era. Not authoritative; use `backend/migrations/000001_initial_schema.up.sql` for the canonical schema picture.

---

## Connecting to Supabase manually (for debugging)
Supabase is publicly reachable. From your laptop:
```bash
psql "postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
```
The connection string is available in the Supabase dashboard under **Project Settings → Database → Connection string → Session pooler**.

For browser-based work, the Supabase dashboard ships its own SQL editor (Project → SQL Editor) which authenticates via your dashboard session - no password needed.
