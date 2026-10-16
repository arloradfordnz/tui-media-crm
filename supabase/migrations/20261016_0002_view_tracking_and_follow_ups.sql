-- view tracking and follow-ups
--
-- Arlo wants to see when a client opens a proposal or a contract, and the
-- client gets a follow-up email when something has sat unanswered for two days
-- (app/api/portal-reminders). These are the columns that make both possible.
--
--   viewed_at         first time the client opened it (never Arlo himself)
--   last_viewed_at    most recent time
--   view_count        how many times
--   sent_at           documents only: when it was emailed to the client
--   last_reminded_at  when the last follow-up went, so it is not re-sent daily

alter table proposals add column if not exists viewed_at timestamptz;
alter table proposals add column if not exists last_viewed_at timestamptz;
alter table proposals add column if not exists view_count integer not null default 0;
alter table proposals add column if not exists last_reminded_at timestamptz;

alter table documents add column if not exists sent_at timestamptz;
alter table documents add column if not exists viewed_at timestamptz;
alter table documents add column if not exists last_viewed_at timestamptz;
alter table documents add column if not exists view_count integer not null default 0;
alter table documents add column if not exists last_reminded_at timestamptz;

-- The accepted-proposal lock (20261016_0001) refused ANY change but
-- updated_at. Recording that a client looked at an accepted proposal again is
-- not a change to what was agreed, so the tracking columns are let through.
-- Everything the client agreed to stays locked exactly as before.
create or replace function lock_accepted_proposal() returns trigger
language plpgsql as $$
declare
  untracked text[] := array['updated_at', 'viewed_at', 'last_viewed_at', 'view_count', 'last_reminded_at'];
begin
  if old.status = 'accepted' then
    if tg_op = 'DELETE' then
      raise exception 'This proposal has been accepted by the client, so it is locked and cannot be deleted. Deleting its job or client is refused for the same reason.'
        using errcode = 'check_violation';
    end if;
    if (to_jsonb(new) - untracked) is distinct from (to_jsonb(old) - untracked) then
      raise exception 'This proposal has been accepted by the client, so it is locked and cannot be changed.'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
