-- ── is_admin() becomes an allow-list ────────────────────────────────────────
--
-- It was written as a deny-list:
--
--     select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'client'
--
-- which reads "everyone except a client is an admin". That is only safe while
-- every account in the project was made by Arlo, and it stopped being true the
-- moment the project had open sign-up: a self-registered user has NO role at
-- all, so the coalesce falls to '', '' <> 'client' is TRUE, and they pass every
-- RLS policy in the database.
--
-- Verified against this project on 6 September 2026, by creating a confirmed
-- user with no app_metadata.role — exactly the state a completed public
-- sign-up leaves behind — and reading through the PUBLIC anon key:
--
--     clients      rows=3   err=none
--     jobs         rows=3   err=none
--     documents    rows=3   err=none
--     email_logs   rows=3   err=none
--
-- Nothing is admitted on the absence of evidence any more: you are an admin
-- because your role says so, or you are not one.
--
-- ORDER MATTERS. The backfill runs first. Flipping the function while the two
-- real accounts still carry no role would lock Arlo out of his own CRM. Both
-- accounts were already stamped role:'admin' through the admin API before this
-- file was written — the update below is the idempotent belt to that braces,
-- and is a no-op if it already ran.
--
-- ── THE PART THAT ACTUALLY BIT ─────────────────────────────────────────────
-- Granting the role is not enough on its own, and this cost a real outage on
-- 6 September 2026.
--
-- is_admin() reads app_metadata.role from the **JWT**, and a JWT is a snapshot
-- taken when it was minted. An account that was already signed in keeps
-- presenting its old, roleless token until that token is refreshed. So the
-- moment this function flipped, the owner's live browser session — signed in
-- the previous day — was denied by every policy: every list rendered empty,
-- every insert failed with "new row violates row-level security policy". No
-- row was ever touched, but an empty CRM is indistinguishable from a deleted
-- one, and that is how it was reported.
--
-- proxy.ts now detects a signed-in non-client whose token is missing the claim
-- and refreshes it there, which is the only place a refresh is safe: rotation
-- invalidates the old refresh token, so the caller has to be able to write the
-- new pair back to cookies. Middleware can; a Server Component cannot, and
-- doing it in the dashboard layout signs the user out instead (that was the
-- first attempted fix, and it was worse than the bug).
--
-- If you run this against a session that is already open, expect one redirect
-- to /login?reason=stale at worst. Signing in again mints a token with the
-- claim and everything returns.

-- 1. The admins, by address. Both are Arlo.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where email in ('hello@tuimedia.nz', 'arloradford.nz@gmail.com');

-- 2. Fail loudly rather than lock the owner out.
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

-- 3. The flip.
create or replace function public.is_admin() returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

-- 4. Anything left over with no role at all is not a client and not an admin.
--    There should be none; this reports rather than deletes, because deleting
--    an account is not something a migration should decide.
do $$
declare r record;
begin
  for r in select email from auth.users
            where coalesce(raw_app_meta_data ->> 'role', '') not in ('admin', 'client')
  loop
    raise notice 'account with no role (can now read nothing): %', r.email;
  end loop;
end $$;
