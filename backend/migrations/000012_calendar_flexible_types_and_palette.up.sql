-- 000012_calendar_flexible_types_and_palette.up.sql
-- Open up the three closed sets in the calendar event editor so admins can grow
-- them without a deploy:
--   1. event_type  - a Postgres enum, extendable only by migration
--   2. color       - a 9-key allowlist in Go
--   3. icon        - an 11-key allowlist with no "none" option
--
-- Written idempotently - safe on an unseeded dev DB and on prod.

-- ---------------------------------------------------------------------------
-- 1. The event-type vocabulary becomes data.
--
-- default_icon/default_color carry the smart defaults that were hardcoded in
-- EventModal.handleTypeChange, so a type created at runtime brings its own look
-- instead of inheriting a generic one. is_builtin marks the six the application
-- code still branches on (birthday drives the cake marker and the two-row cell
-- budget), so a future delete feature can protect them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_event_types (
  slug          text PRIMARY KEY,
  label         text NOT NULL,
  default_icon  text NOT NULL DEFAULT 'star',
  default_color text NOT NULL DEFAULT 'slate',
  is_builtin    boolean NOT NULL DEFAULT false,
  sort_order    int NOT NULL DEFAULT 100,
  admin_id      uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed the six built-ins with the exact icon/color pairs the modal used before,
-- so nothing about the existing editing experience changes. This MUST run
-- before the foreign key below, or every existing event row fails the check.
INSERT INTO calendar_event_types (slug, label, default_icon, default_color, is_builtin, sort_order) VALUES
  ('birthday',     'Birthday',     'cake',           'rose',   true, 10),
  ('bible_study',  'Bible Study',  'book-open',      'sky',    true, 20),
  ('general',      'General',      'star',           'slate',  true, 30),
  ('announcement', 'Announcement', 'bell',           'amber',  true, 40),
  ('prayer',       'Prayer',       'flame',          'violet', true, 50),
  ('graduation',   'Graduation',   'graduation-cap', 'amber',  true, 60)
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_calendar_event_types_sort ON calendar_event_types(sort_order, slug);

-- ---------------------------------------------------------------------------
-- 2. calendar_events.event_type: enum -> text + FK.
--
-- This is the actual blocker. A Postgres enum can only gain a value through a
-- migration, so "add a type" could never be a runtime action. Text + a foreign
-- key keeps referential integrity (no event can point at a type that does not
-- exist) while letting an INSERT into calendar_event_types create a new legal
-- value at runtime.
--
-- The cast is value-preserving: every existing enum label becomes the identical
-- text. The DEFAULT has to be dropped first because it is typed as the enum.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events'
      AND column_name = 'event_type'
      AND udt_name = 'calendar_event_type'
  ) THEN
    ALTER TABLE calendar_events ALTER COLUMN event_type DROP DEFAULT;
    ALTER TABLE calendar_events ALTER COLUMN event_type TYPE text USING event_type::text;
    ALTER TABLE calendar_events ALTER COLUMN event_type SET DEFAULT 'general';
  END IF;
END $$;

-- Backstop: if any row somehow holds a value with no matching type row, park it
-- on 'general' rather than letting the FK fail the whole migration.
UPDATE calendar_events e
SET event_type = 'general'
WHERE NOT EXISTS (
  SELECT 1 FROM calendar_event_types t WHERE t.slug = e.event_type
);

-- ON UPDATE CASCADE so a future rename carries events along.
-- ON DELETE RESTRICT so a type in use can never be dropped out from under them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_event_type_fkey'
  ) THEN
    ALTER TABLE calendar_events
      ADD CONSTRAINT calendar_events_event_type_fkey
      FOREIGN KEY (event_type) REFERENCES calendar_event_types(slug)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- The `calendar_event_type` enum type itself is deliberately left in place. It
-- is now unused, but keeping it is what lets the down migration cast back.

-- ---------------------------------------------------------------------------
-- 3. The shared custom color palette (the GoodNotes model).
--
-- Admins dial a color once and "add to palette"; the swatch then appears in the
-- picker for every admin. Swatches are intentionally unnamed - naming each one
-- is ceremony a church admin would not maintain.
--
-- The CHECK is a security backstop, not just hygiene: this value is rendered
-- into an inline style attribute, so nothing but a 6-digit hex may be stored.
-- UNIQUE makes "add to palette" idempotent when two admins pick the same color.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_palette_colors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hex        text NOT NULL UNIQUE CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int NOT NULL DEFAULT 0,
  admin_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_palette_colors_sort ON calendar_palette_colors(sort_order, created_at);
