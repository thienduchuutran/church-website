create table tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz default now(),
  created_by uuid references admins(id) on delete set null
);

create table post_tags (
  post_id uuid not null references posts(id) on delete cascade,
  tag_id  uuid not null references tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create index on post_tags(tag_id);
