-- Per-admin Discord identity + single-message edit/delete tracking.
--
-- Goal: a website post should appear in Discord as the admin who wrote it
-- (their own Discord name + avatar), as ONE message we can later edit or
-- delete in place. Discord webhooks already allow overriding username/avatar
-- per message, so identity is per-message, not a fixed bot.
--
-- admins.discord_* : filled by the one-time "Link Discord" OAuth flow
--   (scope: identify). All nullable - an admin who never links still posts,
--   falling back to display_name + a default church avatar. avatar_url is
--   built from the Discord user id + avatar hash at link time and cached here
--   so the post path never has to call Discord just to render a sender.
--
-- posts.discord_message_id : the id Discord returns when we send with
--   ?wait=true. Edit (PATCH) and delete (DELETE) target this exact message,
--   so the site stays the single source of truth for that one Discord message.
--
-- posts.discord_channel_key : the env var name of the webhook the message was
--   actually sent through (e.g. 'DISCORD_WEBHOOK_EVENTS'). Stored rather than
--   re-derived from post type so edit/delete hit the SAME webhook even if the
--   type -> channel mapping is changed later. Null until a post has been
--   delivered to Discord (delivery is best-effort and may not have happened).

alter table admins
  add column discord_user_id    text,
  add column discord_username   text,
  add column discord_avatar_url text;

alter table posts
  add column discord_message_id  text,
  add column discord_channel_key text;
