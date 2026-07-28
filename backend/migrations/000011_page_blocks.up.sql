-- 000011_page_blocks.up.sql
-- Evolve page_content into a block model: add block_type, position, title, props.
-- Backfill existing heading/body pairs into single block rows.
-- Re-point translations so approved Vietnamese headings survive the merge.
-- Written idempotently - safe on an unseeded dev DB and on prod.

-- 1. Add new columns (IF NOT EXISTS guards idempotency)
ALTER TABLE page_content ADD COLUMN IF NOT EXISTS block_type text NOT NULL DEFAULT 'rich_text';
ALTER TABLE page_content ADD COLUMN IF NOT EXISTS position   int  NOT NULL DEFAULT 0;
ALTER TABLE page_content ADD COLUMN IF NOT EXISTS title      text NOT NULL DEFAULT '';
ALTER TABLE page_content ADD COLUMN IF NOT EXISTS props      jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Index for ordered reads (one scan per page)
CREATE INDEX IF NOT EXISTS idx_page_content_slug_position ON page_content(page_slug, position);

-- 3. Backfill: merge heading/body pairs into single blocks.
--    For each body row, copy the heading text into its `title` column,
--    set block_type and position. Then delete the orphaned heading rows.
--
--    About page section order:
--      position 0: hero  (hero_title + hero_subtitle)
--      position 1: mission (mission_heading + mission_body)
--      position 2: beliefs (beliefs_heading + beliefs_body)
--      position 3: story   (story_heading + story_body)
--      position 4: values  (values_heading + values_item_1..4 merged into one <ul>)

-- 3a. Hero: hero_subtitle row becomes the hero block
--     title = hero_title's content, content = hero_subtitle's content
UPDATE page_content dest
SET
  title      = src.content,
  block_type = 'hero',
  section_key = 'hero',
  position   = 0,
  updated_at = now()
FROM page_content src
WHERE dest.page_slug   = 'about'
  AND dest.section_key = 'hero_subtitle'
  AND src.page_slug    = 'about'
  AND src.section_key  = 'hero_title';

-- 3b. Mission: mission_body becomes the block
UPDATE page_content dest
SET
  title       = src.content,
  section_key = 'mission',
  position    = 1,
  updated_at  = now()
FROM page_content src
WHERE dest.page_slug   = 'about'
  AND dest.section_key = 'mission_body'
  AND src.page_slug    = 'about'
  AND src.section_key  = 'mission_heading';

-- 3c. Beliefs: beliefs_body becomes the block
UPDATE page_content dest
SET
  title       = src.content,
  section_key = 'beliefs',
  position    = 2,
  updated_at  = now()
FROM page_content src
WHERE dest.page_slug   = 'about'
  AND dest.section_key = 'beliefs_body'
  AND src.page_slug    = 'about'
  AND src.section_key  = 'beliefs_heading';

-- 3d. Story: story_body becomes the block
UPDATE page_content dest
SET
  title       = src.content,
  section_key = 'story',
  position    = 3,
  updated_at  = now()
FROM page_content src
WHERE dest.page_slug   = 'about'
  AND dest.section_key = 'story_body'
  AND src.page_slug    = 'about'
  AND src.section_key  = 'story_heading';

-- 3e. Values: merge values_item_1..4 into a <ul> inside values_heading's row.
--     values_heading becomes the block; its content becomes the <ul>.
--     We use string_agg to build the list. The items become a single rich_text body.
DO $$
DECLARE
  v_heading_id uuid;
  v_heading_content text;
  v_items text;
BEGIN
  -- Get the heading row
  SELECT id, content INTO v_heading_id, v_heading_content
  FROM page_content
  WHERE page_slug = 'about' AND section_key = 'values_heading';

  IF v_heading_id IS NULL THEN
    RETURN; -- no About data seeded yet
  END IF;

  -- Build the <ul> from value items
  SELECT string_agg('<li>' || content || '</li>', E'\n' ORDER BY section_key)
  INTO v_items
  FROM page_content
  WHERE page_slug = 'about'
    AND section_key IN ('values_item_1', 'values_item_2', 'values_item_3', 'values_item_4');

  IF v_items IS NOT NULL THEN
    UPDATE page_content
    SET
      title       = v_heading_content,
      content     = '<ul>' || E'\n' || v_items || E'\n' || '</ul>',
      section_key = 'values',
      position    = 4,
      updated_at  = now()
    WHERE id = v_heading_id;
  ELSE
    -- No items seeded yet, just convert the heading to a block
    UPDATE page_content
    SET
      title       = v_heading_content,
      content     = '',
      section_key = 'values',
      position    = 4,
      updated_at  = now()
    WHERE id = v_heading_id;
  END IF;
END $$;

-- 4. Re-point translations BEFORE deleting heading rows.
--    For each heading row that will be deleted, move its translation
--    to the merged body row (now the block), changing field_name from
--    'content' to 'title' so the translation engine serves it correctly.
--    This preserves approved_by/approved_at - without it, every Vietnamese
--    heading would have to be re-translated and re-approved.

-- hero_title translations -> hero (was hero_subtitle) block, field_name='title'
UPDATE translations t
SET
  record_id  = dest.id,
  field_name = 'title',
  updated_at = now()
FROM page_content src, page_content dest
WHERE src.page_slug    = 'about'
  AND src.section_key  = 'hero_title'
  AND dest.page_slug   = 'about'
  AND dest.section_key = 'hero'
  AND t.record_id      = src.id
  AND t.field_name     = 'content'
  AND t.table_name     = 'page_content'
  -- Guard: don't create a duplicate (record_id, field_name, locale) pair
  AND NOT EXISTS (
    SELECT 1 FROM translations x
    WHERE x.record_id = dest.id AND x.field_name = 'title' AND x.locale = t.locale
  );

-- mission_heading translations -> mission block
UPDATE translations t
SET
  record_id  = dest.id,
  field_name = 'title',
  updated_at = now()
FROM page_content src, page_content dest
WHERE src.page_slug    = 'about'
  AND src.section_key  = 'mission_heading'
  AND dest.page_slug   = 'about'
  AND dest.section_key = 'mission'
  AND t.record_id      = src.id
  AND t.field_name     = 'content'
  AND t.table_name     = 'page_content'
  AND NOT EXISTS (
    SELECT 1 FROM translations x
    WHERE x.record_id = dest.id AND x.field_name = 'title' AND x.locale = t.locale
  );

-- beliefs_heading translations -> beliefs block
UPDATE translations t
SET
  record_id  = dest.id,
  field_name = 'title',
  updated_at = now()
FROM page_content src, page_content dest
WHERE src.page_slug    = 'about'
  AND src.section_key  = 'beliefs_heading'
  AND dest.page_slug   = 'about'
  AND dest.section_key = 'beliefs'
  AND t.record_id      = src.id
  AND t.field_name     = 'content'
  AND t.table_name     = 'page_content'
  AND NOT EXISTS (
    SELECT 1 FROM translations x
    WHERE x.record_id = dest.id AND x.field_name = 'title' AND x.locale = t.locale
  );

-- story_heading translations -> story block
UPDATE translations t
SET
  record_id  = dest.id,
  field_name = 'title',
  updated_at = now()
FROM page_content src, page_content dest
WHERE src.page_slug    = 'about'
  AND src.section_key  = 'story_heading'
  AND dest.page_slug   = 'about'
  AND dest.section_key = 'story'
  AND t.record_id      = src.id
  AND t.field_name     = 'content'
  AND t.table_name     = 'page_content'
  AND NOT EXISTS (
    SELECT 1 FROM translations x
    WHERE x.record_id = dest.id AND x.field_name = 'title' AND x.locale = t.locale
  );

-- 5. Re-point hero_subtitle translations: the hero_subtitle row was renamed to
--    'hero', so translations pointing at the old hero_subtitle row are already
--    fine (same record_id, field_name='content' maps to the block's content).
--    No action needed - they follow the row.

-- 6. Delete orphaned heading rows (translations were already re-pointed above)
--    and values_item_2..4 rows. values_item_1 was NOT merged (values_heading
--    absorbed everything), so it also gets deleted.
--    Also clean up their translation_jobs.

-- Delete translations for rows we're about to drop
DELETE FROM translations
WHERE table_name = 'page_content'
  AND record_id IN (
    SELECT id FROM page_content
    WHERE page_slug = 'about'
      AND section_key IN (
        'hero_title', 'mission_heading', 'beliefs_heading', 'story_heading',
        'values_item_1', 'values_item_2', 'values_item_3', 'values_item_4'
      )
  );

-- Delete pending translation_jobs for the same rows
DELETE FROM translation_jobs
WHERE table_name = 'page_content'
  AND status = 'pending'
  AND record_id IN (
    SELECT id FROM page_content
    WHERE page_slug = 'about'
      AND section_key IN (
        'hero_title', 'mission_heading', 'beliefs_heading', 'story_heading',
        'values_item_1', 'values_item_2', 'values_item_3', 'values_item_4'
      )
  );

-- Delete the orphaned heading and value-item rows themselves
DELETE FROM page_content
WHERE page_slug = 'about'
  AND section_key IN (
    'hero_title', 'mission_heading', 'beliefs_heading', 'story_heading',
    'values_item_1', 'values_item_2', 'values_item_3', 'values_item_4'
  );

-- 7. Assign position=0 to Connect page sections so they have a stable default.
--    Connect sections keep their section_keys and are not merged - they are
--    structured data, not prose blocks. position is unused by Connect's read
--    path but having it populated keeps the column NOT NULL consistent.
UPDATE page_content
SET position = 0
WHERE page_slug = 'connect'
  AND position = 0;
