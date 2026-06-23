alter table posts
  drop column if exists discord_message_id,
  drop column if exists discord_channel_key;

alter table admins
  drop column if exists discord_user_id,
  drop column if exists discord_username,
  drop column if exists discord_avatar_url;
