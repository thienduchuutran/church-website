-- Inverse of 000019_analytics.up.sql.
--
-- Drops all three analytics tables. The raw events are the only thing that
-- cannot be regenerated; the rollup and request stats are derived. Nothing
-- else in the schema references these tables, so there is nothing to re-point.
drop table if exists analytics_request_stats;
drop table if exists analytics_daily;
drop table if exists analytics_events;
