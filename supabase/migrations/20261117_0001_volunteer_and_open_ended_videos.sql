-- Volunteer clients, and retainers with no set number of videos.
--
-- is_volunteer: Arlo makes content for some organisations unpaid (Brook
-- Sanctuary). A $0 value on the clients list read as a client nobody had
-- invoiced yet; this says it is volunteer work on purpose.
--
-- videos_open_ended: one shoot a month and however many videos come out of it.
-- videos_per_month null used to mean "infer it from the last month", which
-- turned one video into a target of one, so a month with none read as owing.
-- When this is true nothing is ever owed: a month counts what was delivered.

alter table clients add column if not exists is_volunteer boolean not null default false;
alter table clients add column if not exists videos_open_ended boolean not null default false;
