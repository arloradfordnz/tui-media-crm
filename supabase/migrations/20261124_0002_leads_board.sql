-- Leads board.
--
-- Leads live in the hello@tuimedia.nz mailbox, not the CRM: replies filed by
-- hand under "02 Leads/Cold" and "02 Leads/Warm", and around 260 cold pitches
-- in Sent ("Locally filmed video ads for X?" and the like). Making every one a
-- client would bury the real clients, so they get their own table, synced
-- from the mailbox by lib/leads.ts. One row per email address.
--
-- The mail fields are rewritten on every sync. follow_up_on, status, note and
-- the nudge draft are Arlo's, and a sync never touches them.
create table if not exists leads (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  name             text,
  organisation     text,
  -- warm | cold (the folder their mail is filed in) | pitched (a pitch in
  -- Sent with nothing back)
  temperature      text not null default 'pitched',
  last_subject     text,
  last_in_at       timestamptz,
  last_out_at      timestamptz,
  messages_in      integer not null default 0,
  messages_out     integer not null default 0,
  -- Set by Later; until then the board works the date out from the mail.
  follow_up_on     date,
  -- open | dropped | won
  status           text not null default 'open',
  note             text,
  client_id        uuid references clients(id) on delete set null,
  nudge_draft      text,
  nudge_drafted_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists leads_client_id_idx on leads(client_id);

alter table leads enable row level security;
create policy "admin_all" on leads for all to authenticated
  using (is_admin()) with check (is_admin());
