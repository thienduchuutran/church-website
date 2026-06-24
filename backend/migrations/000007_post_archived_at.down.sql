drop index if exists posts_archived_at_idx;

alter table posts
  drop column if exists archived_at;
