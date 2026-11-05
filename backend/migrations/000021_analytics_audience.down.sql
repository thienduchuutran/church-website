-- Inverse of 000021_analytics_audience.up.sql.
--
-- Admin rows have no home in the three-column key (a public and an admin row
-- for the same day/metric/dimension would collide), so they are deleted
-- first, explicitly, rather than letting the primary key change fail.
-- Raw admin events are likewise dropped: without the column they would be
-- counted as public on the next rollup, which is the mislabelling this
-- migration exists to end.
delete from analytics_daily where audience = 'admin';
delete from analytics_events where audience = 'admin';

alter table analytics_daily drop constraint if exists analytics_daily_pkey;
alter table analytics_daily add primary key (day, metric, dimension);
alter table analytics_daily drop column if exists audience;

drop index if exists analytics_events_audience_idx;
alter table analytics_events drop constraint if exists analytics_events_audience_check;
alter table analytics_events drop column if exists audience;
