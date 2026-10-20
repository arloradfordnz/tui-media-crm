-- retainer shoot reminders
--
-- /api/portal-reminders emails a retainer client who has no shoot planned for
-- the month, so Arlo doesn't have to chase them. last_shoot_reminded_at is when
-- the last one went, so it is not re-sent daily.

alter table clients add column if not exists last_shoot_reminded_at timestamptz;
