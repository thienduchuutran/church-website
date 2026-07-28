-- 000012_calendar_flexible_types_and_palette.down.sql
-- Reverse the flexible calendar types/palette change.
--
-- This is lossy by necessity: any event using an admin-created type is parked
-- back on 'general', because the enum being restored physically cannot hold a
-- value that was invented after it was defined. Custom hex colors on events are
-- left as-is - the color column is plain text in both directions, so they
-- survive; only the saved swatch list is dropped.

DROP TABLE IF EXISTS calendar_palette_colors;

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_event_type_fkey;

-- Park admin-created types on 'general' before the cast, or the enum cast
-- throws on the first unrecognised label.
UPDATE calendar_events
SET event_type = 'general'
WHERE event_type NOT IN ('birthday', 'bible_study', 'general', 'announcement', 'prayer', 'graduation');

-- Recreate the enum if it was ever dropped, then cast the column back.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_event_type') THEN
    CREATE TYPE calendar_event_type AS ENUM (
      'birthday', 'bible_study', 'general', 'announcement', 'prayer', 'graduation'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events'
      AND column_name = 'event_type'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE calendar_events ALTER COLUMN event_type DROP DEFAULT;
    ALTER TABLE calendar_events
      ALTER COLUMN event_type TYPE calendar_event_type USING event_type::calendar_event_type;
    ALTER TABLE calendar_events ALTER COLUMN event_type SET DEFAULT 'general';
  END IF;
END $$;

DROP TABLE IF EXISTS calendar_event_types;
