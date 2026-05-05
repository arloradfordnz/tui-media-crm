-- Notes feature: general + meeting notes
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text default '',
  kind text not null default 'general' check (kind in ('general', 'meeting')),
  meeting_date date,
  attendees text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_kind_idx on public.notes (kind);
create index if not exists notes_updated_idx on public.notes (updated_at desc);

alter table public.notes enable row level security;

drop policy if exists "notes admin full access" on public.notes;
create policy "notes admin full access"
  on public.notes
  for all
  to authenticated
  using (true)
  with check (true);

-- Auto-update updated_at on row updates
create or replace function public.notes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at
  before update on public.notes
  for each row
  execute function public.notes_set_updated_at();
