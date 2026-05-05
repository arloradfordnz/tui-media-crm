-- Link notes to clients (admin-only, never exposed via portal queries)
alter table public.notes
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists notes_client_id_idx on public.notes (client_id);
