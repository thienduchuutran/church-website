-- Inverse of 000014_calendar_places.up.sql.
--
-- Order matters: the foreign key column has to go before the table it
-- references, or the drop fails on a dependent constraint.
--
-- Events are untouched. private_address was never moved out of calendar_events,
-- so dropping place_id loses only the resolved venue grouping - every event
-- still carries the address its admin typed, and the Locations strip falls back
-- to the pre-000014 one-row-per-event rendering.
alter table calendar_events drop column if exists place_id;

drop table if exists calendar_places;

delete from system_prompts where key = 'place_name';
