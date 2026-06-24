-- Manual "move to Past Events" flag for the homepage / events redesign.
--
-- Goal: split the events display into "Upcoming" and a swipeable "Past"
-- section. An event lands in Past when EITHER its event_date has already
-- passed (automatic, no write needed) OR an admin manually moves it here.
-- This column records that manual move.
--
-- Why a timestamptz and not a boolean: it doubles as the sort key for the
-- Past carousel (most-recently-archived first) and records WHEN the admin
-- moved it. NULL means "not manually archived" - the event's section is then
-- decided purely by event_date (a dateless event with archived_at NULL stays
-- in Upcoming, which is the behaviour this feature is fixing).

alter table posts
  add column archived_at timestamptz;

-- Partial index: the read path only ever filters/sorts on rows that have been
-- archived, so index just those. Keeps the index tiny on a table where most
-- posts (announcements, bible studies, the bulk of events) are never archived.
create index posts_archived_at_idx on posts (archived_at) where archived_at is not null;
