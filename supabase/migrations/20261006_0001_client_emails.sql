-- client emails
--
-- Mail from a known client, read once from hello@tuimedia.nz, boiled down to
-- one tailored line, and attached to that client's record so "Your week" on the
-- dashboard can say "Marty's Meat Smash — wants to move Thursday's shoot"
-- instead of a generic "unread email".
--
-- What is stored is deliberately NOT the email. lib/client-mail.ts reads the
-- body, hands it to Claude, and keeps only the subject, the sender, the
-- one-line heading and a two-sentence summary. The body itself is never
-- written anywhere, so this table cannot leak what a client said in full.

create table if not exists client_emails (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  client_id     uuid not null references clients(id) on delete cascade,

  -- The RFC 822 Message-ID. The dedup key: the inbox is re-read on every sync,
  -- and a message must be summarised (and paid for) exactly once.
  message_id    text not null unique,
  from_address  text not null,
  subject       text not null,
  received_at   timestamptz not null,

  -- Tailored to what they actually said, e.g. "wants to move Thursday's
  -- shoot". Rendered after the client's name on the dashboard.
  heading       text not null,
  summary       text,
  -- reschedule | feedback | question | approval | payment | booking | fyi | other
  kind          text not null default 'other',
  -- false for thank-yous and FYIs: recorded on the client, not shown in Your week.
  needs_action  boolean not null default true,

  -- Set when something was sent back to that address after this arrived. The
  -- row then leaves Your week without anyone clicking anything.
  answered_at   timestamptz
);

create index if not exists client_emails_client_idx on client_emails (client_id, received_at desc);
create index if not exists client_emails_open_idx   on client_emails (received_at desc)
  where needs_action and answered_at is null;

alter table client_emails enable row level security;
create policy "admin_all" on client_emails for all to authenticated
  using (is_admin()) with check (is_admin());
