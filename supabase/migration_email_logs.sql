-- Email logs table for tracking all outbound emails
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  to_address text not null,
  subject text not null,
  type text not null,  -- welcome, proposal, proposal_accepted, delivery, revision, approval
  status text not null default 'sent',  -- sent, failed
  error text,
  client_id uuid references clients(id),
  job_id uuid references jobs(id),
  created_at timestamptz default now()
);

-- Add constraint for valid types
alter table email_logs add constraint email_logs_type_check
  check (type in ('welcome', 'proposal', 'proposal_accepted', 'delivery', 'revision', 'approval'));

-- Add constraint for valid statuses
alter table email_logs add constraint email_logs_status_check
  check (status in ('sent', 'failed'));

-- Enable RLS
alter table email_logs enable row level security;

-- Authenticated users can read all email logs
create policy "Authenticated users can view email logs"
  on email_logs for select
  to authenticated
  using (true);

-- Authenticated users can insert email logs
create policy "Authenticated users can insert email logs"
  on email_logs for insert
  to authenticated
  with check (true);

-- Anon users can insert email logs (portal actions send emails too)
create policy "Anon users can insert email logs"
  on email_logs for insert
  to anon
  with check (true);
