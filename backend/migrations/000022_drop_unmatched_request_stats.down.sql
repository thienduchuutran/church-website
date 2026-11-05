-- Inverse of 000022_drop_unmatched_request_stats.up.sql.
--
-- Nothing to restore: the deleted rows were CORS preflight counts with no
-- analytical value, and recreating them would reintroduce the noise this
-- migration removed. Intentionally a no-op.
select 1;
