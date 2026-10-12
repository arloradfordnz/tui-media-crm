-- lock down the public schema
--
-- Found in a security audit on 13 October 2026, with the anon key alone (the
-- one shipped to every browser, no login):
--
--   * The tables left over from the original Prisma app ("User", "Client",
--     "Job", "Proposal" ...) had row level security OFF. PostgREST exposes the
--     whole public schema, so anyone could read them, and "User" has a
--     `password` column. Client names, emails, phone numbers and proposal
--     tokens were readable too.
--   * app_settings was gated on `auth.role() = 'authenticated'`, which is true
--     for a client portal account, so a client could read and overwrite the
--     iCloud calendar settings.
--   * anon held every privilege (including TRUNCATE, which RLS never covers)
--     on every table.
--   * Self-registration is on at the Supabase project. Nothing in the app uses
--     it, and a self-registered account has no role. A trigger on auth.users
--     cannot stop it: the admin API creates users the same way (role is
--     stamped after the insert), so it blocks "Send account setup" too. The
--     switch has to be turned off in the dashboard; until then a stray account
--     is harmless because is_admin() and getAuthUser() both require
--     role = 'admin'.
--
-- Everything here is re-runnable.

-- ── 1. Row level security on every table, no exceptions ─────────────────────
-- With RLS on and no policy, the table is deny-all to anon and authenticated.
-- The service role and the table owner (this migration, the app's admin
-- client) bypass it, so nothing the app does is affected. The legacy tables
-- are locked, not dropped: dropping is irreversible and they hold the only
-- copy of that old data.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- ── 2. Privileges: anon gets nothing, authenticated gets only what RLS gates ─
-- The app never reads a table with the anon key — the browser client is used
-- for sign-in and sign-out only. Everything else is the signed-in admin
-- (through RLS) or the service role.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

-- ── 3. app_settings: admin only ─────────────────────────────────────────────
-- is_admin() reads role = 'admin' out of the token, so a client portal
-- account (role = 'client') no longer passes.
drop policy if exists "Authenticated users can read settings"   on app_settings;
drop policy if exists "Authenticated users can manage settings" on app_settings;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_settings'
  loop
    execute format('drop policy %I on public.app_settings', p.policyname);
  end loop;
end $$;

create policy "Admin manages settings" on app_settings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ── 4. The unused storage bucket was public ─────────────────────────────────
-- Deliverables live in R2. This bucket is empty and nothing references it.
update storage.buckets set public = false where id = 'deliverables' and public;
