-- Local-dev seed data. Runs once on first container boot, after rds-schema.sql.
-- Safe to re-run: every INSERT uses ON CONFLICT DO NOTHING.
-- To re-seed from scratch: docker compose down -v && docker compose up -d

-- ── Admin whitelist ─────────────────────────────────────────────────────────
-- Add yourself so the admin panel lets you in after Google login.
insert into admins (email, display_name) values
  ('tranhuuthienduc.lop8tc4.08@gmail.com', 'Duc (local dev)')
on conflict (email) do nothing;

-- ── Sample posts ────────────────────────────────────────────────────────────
-- A few rows per type so every public page has something to render.
insert into posts (type, title, body, event_date) values
  ('event',        'Sunday Service',         'Weekly worship service. All are welcome.', now() + interval '3 days'),
  ('event',        'Youth Retreat',          'Annual youth retreat in the mountains.',   now() + interval '21 days'),
  ('announcement', 'Welcome to the site',    'This is local dev seed data. Nothing here is real.', null),
  ('announcement', 'Fellowship lunch',       'Join us after service this Sunday.',       null),
  ('bible_study',  'Gospel of John — Week 1','Notes on John 1:1-18.',                    null),
  ('playlist',     'Easter 2026 Worship',    null,                                       null),
  ('gallery_album','Christmas 2025',         'Photos from the Christmas service.',       null)
on conflict do nothing;

-- ── Sample page content ─────────────────────────────────────────────────────
insert into page_content (page_slug, section_key, content) values
  ('about',   'mission',  'We are a local church community committed to faith, fellowship, and service.'),
  ('about',   'history',  'Founded in the early 2000s, our church has grown from a handful of families to a vibrant congregation.'),
  ('connect', 'address',  '123 Sample St, Anytown, USA'),
  ('connect', 'service_times', 'Sundays at 10:00 AM')
on conflict (page_slug, section_key) do nothing;

-- ── Sample calendar entries (current month) ─────────────────────────────────
insert into calendar_events (date, title, event_type, icon, color) values
  (current_date + 2,  'Bible Study',        'bible_study',  'book',  'indigo'),
  (current_date + 5,  'Prayer Meeting',     'prayer',       'heart', 'rose'),
  (current_date + 12, 'Pastor''s Birthday', 'birthday',     'cake',  'amber')
on conflict do nothing;
