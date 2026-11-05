-- Inverse of 000020_reactions_created_at.up.sql.
--
-- Deliberately does NOT drop the column. On the local DB it existed before
-- this migration (from 000001), and dropping it would destroy the timestamps
-- there; on production it holds real insert times for every reaction made
-- since the up ran. Rolling back only removes the default, which is the one
-- thing this migration changed that is safe to undo.
alter table reactions
  alter column created_at drop default;
