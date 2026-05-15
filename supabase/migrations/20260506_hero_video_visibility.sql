-- HISTORICAL: from the original Supabase project setup. The canonical schema now
-- lives in backend/migrations/ (golang-migrate, applied on backend startup). This
-- ALTER is identical to backend/migrations/000002_hero_video_visibility.up.sql; do
-- not re-apply - "column is_visible already exists" would be the only outcome.

alter table hero_videos add column is_visible boolean not null default true;
