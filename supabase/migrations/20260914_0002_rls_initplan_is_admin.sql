-- Call is_admin() once per QUERY instead of once per ROW.
--
-- ── What is wrong with the policies as written ─────────────────────────────
-- migration_client_accounts.sql appended `and public.is_admin()` to every
-- policy that grants the authenticated role anything, which was exactly the
-- right security change. It left a performance shape behind, though, and it is
-- the single best known footgun in Postgres RLS.
--
-- A bare function call in a policy predicate is part of the per-row filter, so
-- Postgres runs it for EVERY row it examines. is_admin() parses the JWT out of
-- request headers each time. The answer is identical for all of them — it
-- depends on the request, not the row — so every call after the first is
-- wasted work, and the waste scales with the size of the table rather than
-- with the size of the result.
--
-- Wrapping the call in a scalar subquery is what fixes it. `(select f())`
-- makes the planner hoist it into an InitPlan: evaluated once, before the
-- scan, and the constant reused for every row. This is Supabase's own
-- documented guidance for `auth.*()` helpers in policies, and the shape is
-- semantically identical — same function, same result, same access decision.
-- Nothing here loosens a policy; it only stops asking the same question
-- thousands of times.
--
-- ── Honesty about the size of the win TODAY ────────────────────────────────
-- This database is small — the largest table is a few hundred rows — so the
-- measurable saving right now is milliseconds, not seconds. It is in here
-- because the cost grows with every row ever added, activities/email_logs/
-- notifications are append-only and grow forever, and the fix is free and
-- permanent. Do not read this migration as the reason the app got faster; the
-- region move in vercel.json is.
--
-- Written as a loop over pg_policies for the same reason the original was:
-- it catches every policy that has the shape, whatever it is called and
-- whenever it was added, and it is safe to run twice.

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
      and (coalesce(qual, '') like '%is_admin()%'
        or coalesce(with_check, '') like '%is_admin()%')
  loop
    -- Already hoisted (this migration re-run): leave it alone. Without this
    -- guard a second run would wrap the wrapper.
    if coalesce(p.qual, '') like '%select is_admin()%'
       or coalesce(p.qual, '') like '%select public.is_admin()%'
       or coalesce(p.with_check, '') like '%select is_admin()%'
       or coalesce(p.with_check, '') like '%select public.is_admin()%' then
      continue;
    end if;

    new_qual := replace(replace(p.qual,
                  'public.is_admin()', '(select public.is_admin())'),
                  'is_admin()',        '(select public.is_admin())');
    -- The first replace may already have produced the wrapped form, and the
    -- second would then match inside it; collapse any double wrap back down.
    new_qual := replace(new_qual,
                  '(select (select public.is_admin()))', '(select public.is_admin())');

    new_check := replace(replace(p.with_check,
                   'public.is_admin()', '(select public.is_admin())'),
                   'is_admin()',        '(select public.is_admin())');
    new_check := replace(new_check,
                   '(select (select public.is_admin()))', '(select public.is_admin())');

    -- INSERT policies have only WITH CHECK, SELECT and DELETE only USING;
    -- altering a clause a policy does not have is an error.
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

    raise notice 'hoisted is_admin() in %.%', p.tablename, p.policyname;
  end loop;
end $$;

-- Verify — expect zero rows:
--   select tablename, policyname from pg_policies
--   where schemaname = 'public'
--     and (coalesce(qual,'') like '%is_admin()%' or coalesce(with_check,'') like '%is_admin()%')
--     and coalesce(qual,'')       not like '%select public.is_admin()%'
--     and coalesce(with_check,'') not like '%select public.is_admin()%';
