-- Clean up duplicate post_image records created by BulkUploader queue bug.
-- The bug caused files to be added to the upload queue multiple times, resulting in
-- duplicate uploads. E.g., uploading 76 files created 2632 image records.
-- This query identifies duplicate images per post and removes all but the first
-- occurrence (keeping the original created_at timestamps).

DELETE FROM post_images
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY created_at, id) as rn
    FROM post_images
  ) ranked
  WHERE rn > 1
);
