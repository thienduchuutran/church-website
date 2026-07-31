-- 000014_calendar_places.up.sql
-- Give the calendar a real notion of a PLACE, so the Locations strip lists
-- venues instead of repeating one address once per event.
--
-- Before this, the only location data was calendar_events.private_address: a
-- free-text box on each event. Eleven events at the church printed the church
-- eleven times, and the strip's rows were really events wearing a "Locations"
-- heading.
--
-- The modelling insight is that a place name is a FUNCTION OF ITS ADDRESS - two
-- different places cannot share one - so the name belongs in a table keyed by
-- address, not on the event. That makes dedupe structural (a group-by on a
-- foreign key) rather than a string comparison redone on every render, and it
-- means the name only has to be worked out once per address for the life of the
-- church.
--
-- Written idempotently - safe on an unseeded dev DB and on prod.

-- ---------------------------------------------------------------------------
-- 1. The place registry.
--
-- address_key is the normalized address (see model.NormalizeAddressKey: case
-- folded, diacritics stripped, punctuation dropped, "Street"/"St" and
-- "Massachusetts"/"MA" collapsed). It carries the UNIQUE constraint, so "these
-- two are the same place" is a database guarantee rather than a rendering
-- convention - an admin who types the same address two different ways still
-- lands on one row.
--
-- address keeps the human formatting of whatever was typed most recently. It is
-- what actually gets printed; address_key exists only to match on.
--
-- name is the label the Locations strip shows ("Church", "Chris & Sebs"). It is
-- proposed by the model and correctable by an admin.
--
-- name_source records which of those two wrote it. This is the guard that makes
-- an admin's correction permanent: the naming worker only ever writes over an
-- 'ai' row, so a human rename can never be silently undone by a later model
-- call. The CHECK keeps the column to the two values the code branches on.
-- ---------------------------------------------------------------------------
create table if not exists calendar_places (
  id          uuid primary key default gen_random_uuid(),
  address_key text not null unique,
  address     text not null,
  name        text not null,
  name_source text not null default 'ai' check (name_source in ('ai', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column calendar_places.address_key is
  'Normalized address - the identity of a place. Written by model.NormalizeAddressKey; never displayed. See migration 000014.';
comment on column calendar_places.name_source is
  '''ai'' = model-proposed and overwritable; ''admin'' = a human renamed it and the naming worker must not touch it. See migration 000014.';

-- ---------------------------------------------------------------------------
-- 2. Events point at a place.
--
-- Nullable, and deliberately NOT backfilled: every existing event keeps
-- place_id = null and renders address-only until it is next saved, so deploying
-- this changes nothing that is already on screen.
--
-- private_address stays exactly where it is. It remains the source of truth for
-- what the admin typed on THIS event and is what address_public gates; place_id
-- is the resolved answer to "which venue is that". Keeping both means an
-- address edit can re-resolve without any data being reconstructed.
--
-- ON DELETE SET NULL, never CASCADE: removing a place must never take the
-- congregation's events with it. The event falls back to printing its own
-- address, which is exactly the pre-000014 behaviour.
-- ---------------------------------------------------------------------------
alter table calendar_events
  add column if not exists place_id uuid references calendar_places(id) on delete set null;

-- Partial: only address-bearing events have a place, and they are the minority.
create index if not exists idx_calendar_events_place
  on calendar_events (place_id) where place_id is not null;

-- ---------------------------------------------------------------------------
-- 3. The naming prompt.
--
-- Lives in system_prompts beside vi_translation and en_translation so it is
-- editable in Supabase and picked up by the running server within the
-- PromptCache TTL (5 minutes) - prompt tuning without a redeploy, which matters
-- because this prompt encodes local knowledge that will need adjusting as the
-- church adds venues.
--
-- The judgement being bought here is not string manipulation. Sometimes the
-- activity word IS the venue ("Church Clean up/renovation" -> Church) and
-- sometimes the event name IS the destination ("Youth Camp" -> Youth Camp).
-- No regex separates those two cases.
--
-- ON CONFLICT DO NOTHING matches the 000004 and 000013 seeds, so re-running
-- against a database whose prompt has since been edited does not clobber it.
-- ---------------------------------------------------------------------------
insert into system_prompts (key, content, version) values (
  'place_name',
  'You name PLACES for the calendar of VGOMNE, Vietnamese Gospel Outreach Ministry of New England, a Vietnamese-American Christian and Missionary Alliance (CMA) congregation in Saugus, Massachusetts.

The church building is 101 Main St, Saugus, MA 01906. Always call it "Church".

You are given an event title and the street address it happens at. Reply with ONLY the short name of the PLACE - the way a church bulletin labels a location in its footer.

RULES:
- The place is WHERE the event happens, not WHAT happens there.
- Drop weekdays (Friday, Saturday), times (7pm, 10am-4pm), and activity words
  (BBS, Bible Study, meeting, clean up, renovation, service, practice, rehearsal).
- Keep the venue or the host. A host name stays as written, including "&" and
  personal names.
- When the event happens at the church building, answer exactly "Church".
- When the event name is itself the destination, keep it ("Youth Camp").
- If you are given a list of places already in use, prefer an exact match from
  that list over inventing a new wording for the same venue.
- Answer in the same language the event title is written in.
- 1 to 4 words. No address, no trailing punctuation, no quotes, no explanation.

EXAMPLES:
Title: Friday BBS Chris & Sebs | Address: 39 Bridle Ridge Dr, North Grafton, MA 01536
Chris & Sebs

Title: Saturday BBS Church 7pm | Address: 101 Main St, Saugus, MA 01906
Church

Title: Church Clean up/renovation | Address: 101 Main St, Saugus, MA 01906
Church

Title: Friday BBS MST''s House | Address: 203 Essex Street, Saugus, MA 01906
MST House

Title: Youth Camp | Address: 1414 Plank Road, Hooversville, PA 15936
Youth Camp

OUTPUT: Return ONLY the place name. No preamble, no explanation, no quotes.',
  '1.0.0'
) on conflict (key) do nothing;
