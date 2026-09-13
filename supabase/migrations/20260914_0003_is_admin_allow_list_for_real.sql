-- is_admin() becomes an allow-list — this time in a migration that RUNS.
--
-- ── This is not a new idea; it is an unapplied one ─────────────────────────
-- supabase/migration_admin_allowlist.sql already says everything below, and
-- says it well. It was written on 6 September 2026 and it was never applied.
-- It lives in the legacy folder, which the runner deliberately never executes
-- (see supabase/migrations/README.md) because those files were meant to be
-- pasted into the Supabase SQL editor by hand. This one never was.
--
-- Found on 14 September 2026 while profiling RLS, by reading the function body
-- out of the live database rather than out of the repo:
--
--     select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'client'
--
-- That is still the deny-list. The repo has believed for eight days that this
-- was fixed.
--
-- ── Why it matters ────────────────────────────────────────────────────────
-- The deny-list reads "everyone who is not a client is an admin". An account
-- with no app_metadata.role at all — which is exactly what a completed public
-- sign-up leaves behind — extracts NULL, coalesces to '', and '' <> 'client'
-- is TRUE. It passes every policy in the database.
--
-- Sign-up on this project is open (`disable_signup: false`) and the anon key
-- ships in the browser bundle, so the path from "stranger on the internet" to
-- "reads every client, job, document and email log" was: sign up, confirm the
-- address, query. Verified against the live database on 14 September 2026:
--
--     is_admin() with app_metadata {}            -> true
--     count(clients) as that token               -> 39
--
-- There are currently zero roleless accounts, so as far as auth.users records
-- this was never exercised. It was still open.
--
-- Closing the hole in SQL is only half of it: **turn public sign-up off** in
-- Supabase → Authentication → Providers → Email. Nothing in this repo can do
-- that, and nobody should be able to create an account here at all.
--
-- ── Order matters, and the guard below is not decoration ───────────────────
-- Flipping this while no account carries role='admin' locks the owner out of
-- his own CRM: every list renders empty and every insert is denied, which is
-- indistinguishable from deleted data. Both real accounts were confirmed to
-- carry role='admin' before this was written, and step 1 re-stamps them
-- idempotently anyway. Step 2 refuses to flip if that is somehow not true.
--
-- A session signed in before this runs keeps presenting its older token until
-- it refreshes. proxy.ts repairs that on the next request; the worst case is
-- one redirect to /login?reason=stale. lib/client-auth.ts has the full story.

-- 1. The admins, by address. Both are Arlo.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where email in ('hello@tuimedia.nz', 'arloradford.nz@gmail.com');

-- 2. Fail the deploy rather than lock the owner out.
do $$
declare n int;
begin
  select count(*) into n from auth.users
   where coalesce(raw_app_meta_data ->> 'role', '') = 'admin';
  if n = 0 then
    raise exception 'Refusing to flip is_admin(): no account carries role=admin, so this would lock everyone out.';
  end if;
  raise notice 'admin accounts found: %', n;
end $$;

-- 3. The flip. You are an admin because your role says so, or you are not one.
create or replace function public.is_admin() returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

-- 4. Report anything left with no role. Reported, not deleted — removing an
--    account is not a decision a migration should take on its own.
do $$
declare r record;
begin
  for r in select email from auth.users
            where coalesce(raw_app_meta_data ->> 'role', '') not in ('admin', 'client')
  loop
    raise notice 'account with no role (can now read nothing): %', r.email;
  end loop;
end $$;
