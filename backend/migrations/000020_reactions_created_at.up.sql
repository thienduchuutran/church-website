-- 000020_reactions_created_at.up.sql
-- Production's reactions table has no created_at column.
--
-- The table was created in the Supabase era, before migrations were embedded
-- in the Go binary, and 000001 was baselined on production rather than run.
-- The local schema (built from 000001) has the column; production does not.
-- Nothing ever read it until the analytics pipeline panel counted
-- "reactions added in range" and failed with
--   ERROR: column "created_at" does not exist (SQLSTATE 42703)
-- on 2026-11-05. See docs/agents/known-quirks.md.
--
-- Two statements on purpose. `ADD COLUMN ... DEFAULT now()` would stamp every
-- existing reaction with the moment this migration ran, and the dashboard
-- would then report hundreds of reactions "added" on deploy day. Adding the
-- column without a default leaves old rows NULL - honestly unknown - and the
-- default applies only to rows inserted from here on.
--
-- Idempotent: a no-op on the local DB, which already has the column.
alter table reactions
  add column if not exists created_at timestamptz;

alter table reactions
  alter column created_at set default now();

comment on column reactions.created_at is
  'NULL for reactions that predate migration 000020 on production (their time is unknown). Range counts in analytics exclude them.';
