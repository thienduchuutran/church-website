-- 000011_page_blocks.down.sql
-- Drops the four block-model columns added by the up migration.
-- The heading/body merge is NOT reversed (one-way by design) - the data
-- stays in its merged form, which is compatible with the original read path
-- because section_key + content still exist.

DROP INDEX IF EXISTS idx_page_content_slug_position;

ALTER TABLE page_content DROP COLUMN IF EXISTS props;
ALTER TABLE page_content DROP COLUMN IF EXISTS title;
ALTER TABLE page_content DROP COLUMN IF EXISTS position;
ALTER TABLE page_content DROP COLUMN IF EXISTS block_type;
