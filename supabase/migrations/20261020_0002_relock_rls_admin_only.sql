-- relock RLS: every policy requires is_admin(), and the deploy fails if one doesn't
--
-- ── Why ────────────────────────────────────────────────────────────────────
-- Found in a security review on 20 October 2026. Several tables were created by
-- the hand-run files in supabase/ with policies that admit ANY signed-in user:
--
--     connected_accounts    using (true)   -- the Xero and Instagram OAuth tokens
--     social_links, email_templates, email_logs, business_health_reports,
--     sms_messages, agent_ticks, assistant_flags, assistant_pending_actions,
--     integration_status, time_entries
--
-- migration_client_accounts.sql appended `and is_admin()` to every policy that
-- existed WHEN IT WAS RUN. Nothing records which of those files were pasted in
-- before it and which after, so any table created later may still say
-- `using (true)`. A client portal login (role 'client') or the marketing login
-- (role 'marketer') holds a real token for the `authenticated` role, and the
-- anon key ships in every browser, so either could read those rows straight
-- from PostgREST, OAuth tokens included.
--
-- Nothing in the app needs a non-admin to pass RLS: the portal, the proposal
-- page, the marketing page, crons and webhooks all read with the service role
-- after authorising the request themselves. So the rule is simply that no
-- policy grants anything without is_admin().
--
-- Re-runnable. Appending the guard to a policy that already has it is a no-op
-- (x and a and a = x and a), so the loop does not try to be clever about which
-- ones are already safe beyond the obvious case.

-- ── 1. RLS on every table, including any added since 20261013_0001 ──────────
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'enabled RLS on %', t.relname;
  end loop;
end $$;

-- ── 2. anon gets nothing, again, for tables created since ──────────────────
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ── 3. Every policy for anon / authenticated / public requires an admin ────
-- A policy whose text never mentions is_admin, or mentions it only beside an
-- OR (where it guards nothing), gets `and (select public.is_admin())` added.
-- service_role bypasses RLS anyway; a policy written only for it is left alone.
do $$
declare
  p record;
  guard constant text := '(select public.is_admin())';
  new_qual  text;
  new_check text;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and roles && array['anon', 'authenticated', 'public']::name[]
  loop
    if (coalesce(p.qual, '') like '%is_admin%' and coalesce(p.qual, '') not ilike '% or %')
       and (p.with_check is null
            or (p.with_check like '%is_admin%' and p.with_check not ilike '% or %')) then
      continue;
    end if;

    new_qual  := case when p.qual       is null then null else '(' || p.qual       || ') and ' || guard end;
    new_check := case when p.with_check is null then null else '(' || p.with_check || ') and ' || guard end;

    if new_qual is not null and new_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, new_qual, new_check);
    elsif new_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, new_qual);
    elsif new_check is not null then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, new_check);
    end if;
    raise notice 'locked policy "%" on %', p.policyname, p.tablename;
  end loop;
end $$;

-- ── 4. Prove it, or fail the deploy ────────────────────────────────────────
-- A deploy that ships with an open table is worse than one that doesn't ship.
do $$
declare
  open_tables   text;
  open_policies text;
begin
  select string_agg(c.relname, ', ') into open_tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

  select string_agg(tablename || '.' || policyname, ', ') into open_policies
  from pg_policies
  where schemaname = 'public'
    and roles && array['anon', 'authenticated', 'public']::name[]
    and (coalesce(qual, '') not like '%is_admin%' and qual is not null
         or coalesce(with_check, '') not like '%is_admin%' and with_check is not null);

  if open_tables is not null then
    raise exception 'RLS still off on: %', open_tables;
  end if;
  if open_policies is not null then
    raise exception 'Policies still open to non-admins: %', open_policies;
  end if;
end $$;
