-- Per-address website visibility.
--
-- When false (the default), private_address is hidden from the public website
-- and only admins see it; when true, the public calendar shows it too. The PNG
-- export is admin-driven and always includes the address regardless of this
-- flag - it's shared in the closed Discord, where the paper calendar always
-- printed host/venue addresses. Default false is the privacy-safe choice:
-- existing addresses stay hidden until an admin opts each one in.
alter table calendar_events
  add column address_public boolean not null default false;
