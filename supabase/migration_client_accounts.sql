-- Client portal accounts.
--
-- Until now the portal's auth was the unguessable portal_token in the URL.
-- That still works (there are delivery emails in the wild carrying those
-- links, and they must not break), but clients can now also hold a real
-- account with an email and a password.
--
-- This table is the authoritative mapping from a Supabase auth user to the
-- client they may see. The portal resolves client_id from HERE, never from
-- the JWT — a claim in a token is something the client's browser holds, a row
-- here is something only the service role can write.

create table if not exists client_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One account per client. Arlo runs a one-person shop with one contact per
-- client; if that ever needs to become several, drop this index rather than
-- discovering the ambiguity at read time.
create unique index if not exists client_users_client_id_key on client_users(client_id);

alter table client_users enable row level security;

-- No policies, deliberately. Nothing but the service role touches this table,
-- and the service role bypasses RLS. An empty policy set means anon and
-- authenticated get nothing — including a client trying to repoint their own
-- row at somebody else's client_id.

-- Tracks whether a setup email has gone out, so the dashboard can show the
-- state of each client's account without a round trip to auth.users.
alter table clients add column if not exists portal_invited_at timestamptz;


-- ---------------------------------------------------------------------------
-- Keep client accounts out of the CRM's own tables.
-- ---------------------------------------------------------------------------
--
-- Every policy in this schema reads "FOR ALL TO authenticated USING (true)".
-- That was exactly right while the only account in the project was Arlo's. It
-- stops being right the moment a client can sign in, because a client account
-- is 'authenticated' too — the policies would hand them every client, job,
-- invoice and document in the business.
--
-- The role claim lives in app_metadata, which only the service role can write,
-- and PostgREST has already verified the JWT's signature by the time auth.jwt()
-- can be read here. So a client cannot edit their way out of this.

create or replace function public.is_admin() returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'client'
$$;

-- Rewritten by loop rather than by listing the tables. There are 21 of them
-- across a dozen migration files, plus four separate per-command policies on
-- connected_accounts, and a hand-written list is a list somebody forgets to
-- add to. This catches every policy that grants the authenticated role
-- anything, whatever it is called and whenever it was added.
do $$
declare
  p record;
  new_qual  text;
  new_check text;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and 'authenticated' = any(roles)
      and tablename <> 'client_users'
  loop
    -- Already carries the guard (this migration re-run): skip.
    if coalesce(p.qual, '') like '%is_admin()%'
       or coalesce(p.with_check, '') like '%is_admin()%' then
      continue;
    end if;

    new_qual  := case when p.qual is null then null
                      else '(' || p.qual || ') and public.is_admin()' end;
    new_check := case when p.with_check is null then null
                      else '(' || p.with_check || ') and public.is_admin()' end;

    -- USING and WITH CHECK are not both present on every policy: INSERT has
    -- only WITH CHECK, SELECT and DELETE only USING. Altering a clause the
    -- policy does not have is an error, so each combination is issued as the
    -- statement that policy actually accepts.
    if new_qual is not null and new_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)',
                     p.policyname, p.tablename, new_qual, new_check);
    elsif new_qual is not null then
      execute format('alter policy %I on public.%I using (%s)',
                     p.policyname, p.tablename, new_qual);
    elsif new_check is not null then
      execute format('alter policy %I on public.%I with check (%s)',
                     p.policyname, p.tablename, new_check);
    end if;
  end loop;
end $$;

-- Verify: every authenticated policy should now mention is_admin().
-- Expect zero rows.
--
--   select tablename, policyname from pg_policies
--   where schemaname = 'public' and 'authenticated' = any(roles)
--     and tablename <> 'client_users'
--     and coalesce(qual,'')       not like '%is_admin()%'
--     and coalesce(with_check,'') not like '%is_admin()%';
