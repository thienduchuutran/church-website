-- Add the "graduation" category so the calendar can mark graduations with a cap
-- icon (high-school/college grads, seminary completion, etc.). Additive: every
-- existing event keeps its event_type.
--
-- ADD VALUE works outside a transaction, and inside one on PG12+ (Supabase is
-- PG15) as long as the new value isn't used in the same transaction - the app
-- only inserts graduation events on later requests, so this is safe.
alter type calendar_event_type add value if not exists 'graduation';
