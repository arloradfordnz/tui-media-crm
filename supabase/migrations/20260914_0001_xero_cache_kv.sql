-- A small server-side cache that outlives a single serverless instance.
--
-- ── The problem ────────────────────────────────────────────────────────────
-- lib/xero.ts has always had a stale-while-revalidate cache in front of the
-- Xero API, because those round trips take SECONDS and the money surfaces read
-- from them on every visit. It was a `Map` in module scope, which is a cache
-- per *lambda instance*: Vercel starts instances, freezes them between
-- requests and discards them constantly, so in production most requests met an
-- empty Map and took the "cold: block once" path — the slow one the cache
-- exists to avoid. The cache was doing its job perfectly in local dev, where
-- there is one long-lived process, and almost never in production.
--
-- ── What this adds ─────────────────────────────────────────────────────────
-- A shared second tier every instance can see. The Map stays as the first tier
-- (free, and right for repeat reads inside one request); this table is what a
-- cold instance now finds instead of nothing.
--
-- Deliberately generic rather than xero-shaped: it stores an opaque JSON value
-- under a key, so the next slow upstream can use it without another migration.
--
-- Not a replacement for business_health_reports — that table is a dated record
-- of what the business looked like, and is read as history. Nothing in here is
-- worth keeping: every row can be dropped at any moment and the only cost is
-- one slow refetch.

create table if not exists kv_cache (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Reached only through the service-role client (lib/supabase-admin.ts), which
-- bypasses RLS. RLS is still enabled with no policy at all, so an anon or
-- authenticated key gets nothing — this holds upstream financial data and no
-- browser has any business reading it directly.
alter table kv_cache enable row level security;
