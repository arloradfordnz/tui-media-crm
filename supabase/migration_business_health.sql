-- Daily AI-generated business health report
create table if not exists business_health_reports (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  score int,
  headline text,
  summary text not null,
  signals jsonb not null default '{}'::jsonb
);

create index if not exists business_health_reports_generated_at_idx
  on business_health_reports (generated_at desc);

alter table business_health_reports enable row level security;

create policy "Authenticated users can view business health reports"
  on business_health_reports for select
  to authenticated
  using (true);

create policy "Service role can insert business health reports"
  on business_health_reports for insert
  to service_role
  with check (true);
