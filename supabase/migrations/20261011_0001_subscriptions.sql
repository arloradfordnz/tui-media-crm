-- subscriptions
--
-- The standing monthly bills on the dashboard. They were seven literals in
-- app/dashboard/SubscriptionsPanel.tsx, which was the right call while nothing
-- ever changed them. Arlo now wants to tell Tui "add Adobe, $35 on the 20th"
-- and have it appear, so they get a table.
--
-- Renewal DAY, not a next-charge date: every one of these repeats on the same
-- day of the month, and a stored date goes stale the moment it passes. The
-- panel computes the next charge from today on every render.
--
-- Cancelling sets active = false rather than deleting, so "what was I paying
-- for in March" stays answerable and an accidental cancel is one update away
-- from undone.

create table if not exists subscriptions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  name        text not null,
  -- NZD per month, as charged.
  amount      numeric(10, 2) not null check (amount >= 0),
  -- Day of the month it renews. 29-31 are clamped to the month's length.
  day         smallint not null check (day between 1 and 31),
  -- Short muted qualifier shown under the name ("Billed through WK Strawbridge").
  note        text,
  active      boolean not null default true
);

create index if not exists subscriptions_active_idx on subscriptions (active, day);

alter table subscriptions enable row level security;
create policy "admin_all" on subscriptions for all to authenticated
  using (is_admin()) with check (is_admin());

-- The seven that were hard-coded, carried over as they were.
insert into subscriptions (name, amount, day, note) values
  ('Anthropic (Claude)',          40.74,  5, null),
  ('iCloud+',                      6.10,  8, null),
  ('Synology C2 Cloud Storage',    7.99,  9, null),
  ('Xero',                        28.18, 13, 'Billed through WK Strawbridge'),
  ('Google One',                   3.49, 16, null),
  ('Meta Verified (Instagram)',   19.34, 26, null),
  ('ChatGPT',                     14.25, 28, null);
