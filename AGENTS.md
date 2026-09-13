<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema changes

Migrations are automatic. Write one with `npm run migrate:new -- <name>`, which
puts a correctly ordered file in `supabase/migrations/`, and it is applied on
the next deploy (`vercel-build` runs the migrator before `next build`). Never
edit a migration that has already run — the runner checksums them and will
refuse. `supabase/migrations/README.md` has the rest; the one-time `DATABASE_URL`
setup is `npm run migrate:setup`.

The older `supabase/migration_*.sql` files are history and are never executed
by the runner. Do not add to them.

# Where the latency actually was (14 September 2026)

Read this before "optimising" anything here, and before changing `vercel.json`.

## The functions run in Singapore ON PURPOSE

`vercel.json` pins `"regions": ["sin1"]`. That line is worth more than every
other performance change in this repo combined, and removing it undoes all of
them.

The Supabase database is in **AWS ap-southeast-1 (Singapore)** — read it off
`DATABASE_URL`, the host is `aws-1-ap-southeast-1.pooler.supabase.com`. Vercel's
default function region is `iad1` (Washington DC). With no `regions` key, every
query this app made went Washington → Singapore → Washington: roughly **240ms of
pure network per query**, on a database where the queries themselves take about
a millisecond because the biggest table has a few hundred rows.

Measured on the live site before the change (`x-vercel-id: syd1::iad1::…`, the
second field is the compute region):

    /login              (static, edge)     ~70ms
    any serverless function               ~300-420ms before doing any work

Compute belongs next to the data, not next to the user, because a page render
makes many database round trips and only one trip to the browser. Singapore is
also closer to New Zealand than Washington is, so there is no trade here.

**If a page feels slow, check `x-vercel-id` on the response before you touch
the query.** Two regions in that header that are not `syd1::sin1` means the
pinning was lost, and no amount of query tuning will make up for it.

## Indexes and RLS were not the problem, and cannot be

This database is tiny. Adding indexes to a 19-row `jobs` table changes nothing
measurable, and it is the wrong instinct to reach for first here. There ARE
indexes now (`20260914_0004`) and the RLS policies do hoist `is_admin()` into an
InitPlan (`20260914_0002`), both of which are correct and worth having as the
data grows — but neither is why anything got faster. Do not let a green
EXPLAIN convince you the slow thing is the database.

## getUser() is a network call, so it happens once per request

`lib/supabase.ts` exports `getVerifiedUser()`, wrapped in React's `cache()`.
Everything that needs to know who is signed in goes through it —
`isClientAccount`, `hasAdminClaim`, `getAuthUser`, `getClientSession`.

`supabase.auth.getUser()` asks the auth server, which is the entire point of
using it over `getSession()` (see lib/client-auth.ts). It is not a cookie read.
The dashboard layout used to call it twice, sequentially, before rendering a
byte. **Do not add a bare `supabase.auth.getUser()` call** — use
`getVerifiedUser()` and get the same verified answer for free.

The same applies to any row two things in one request need: `generateMetadata`
and the page body both run per request, and the portal and proposal pages each
used to fetch their row twice until a `cache()` wrapper was put around the
lookup.

## The Xero cache has two tiers because one of them was imaginary

`swrCached` in `lib/xero.ts` was a `Map` in module scope — a cache per lambda
instance, on a platform that discards instances constantly. In production most
requests found it empty and took the seconds-long "block on Xero" path. It now
falls back to a `kv_cache` row (`20260914_0001`), which every instance shares.

Background refreshes go through `after()` from `next/server`, not a floating
promise: a bare `void refresh()` is liable to be frozen the moment the response
flushes, so the "revalidate" half of stale-while-revalidate never happened.

# Traps in this repo

Each of these has already cost a debugging session. They all present as a code
bug and are not one.

## The dev server serves stale code after an edit

`next.config.ts` puts the dev build in `/tmp/tui-media-crm-next` (out of the
iCloud-synced folder, where the watcher misses changes). That cache goes stale
on its own. Symptoms: an edit "doesn't apply", a hydration mismatch appears
where the server HTML shows values you just changed away from, or a route
handler keeps returning its old behaviour with no compile error.

**Before debugging any change that seems not to have taken effect:**

```bash
# 1. STOP the server. Never clear the cache while it is running — that kills
#    the cache mid-flight and every route 500s with an SST panic that looks
#    exactly like a code regression.
# 2. rm -rf /tmp/tui-media-crm-next
# 3. Start it again.
```

Verify against a restarted server before concluding the code is wrong. Three
times in one session a "bug" was this and nothing else.

**A restart is not always enough, and `touch` never is.** Turbopack keyed off
content, so a CSS block appended to `app/globals.css` stayed absent from the
served stylesheet through a full stop / cache-wipe / restart, and `touch` did
not shake it loose either. Adding a throwaway rule (`.zz-sentinel { color: red }`)
forced the rebuild, after which the real block appeared — and then removing the
sentinel was itself a content change, so it stuck. If a style is missing from
the compiled output, confirm it with

```bash
curl -s "http://localhost:3003$(curl -s http://localhost:3003/login   | grep -o '/_next/static/chunks/[^"]*\.css' | head -1)" | grep -c my-class
```

before touching the CSS itself — the source is usually fine.

## Lightning CSS dedupes backdrop-filter

Tailwind v4's Lightning CSS treats `backdrop-filter` and
`-webkit-backdrop-filter` as one property **within a single rule** and keeps
only the last one written. A whole pass of glass surfaces silently rendered as
flat opacity because the `-webkit-` line came last.

Put the standard `backdrop-filter` in its **own separate rule** from the
`-webkit-` one. Dedupe is within-rule, not cross-rule. Any new glass surface
must follow that split or it will not blur.

## Lightning CSS merges selector lists into :is()

A comma-separated selector list gets compiled into a single `:is(...)` rule,
and **`:is()` takes the specificity of its most specific argument**. So a group
like

```css
.field:has(.field-input:focus) > .field-label,
.field:has(textarea.field-input:not(:placeholder-shown)) > .field-label { ... }
```

outranks a plain `.field:has(.field-input:focus) > .field-label` written
*after* it, because the `textarea` member dragged the whole group's specificity
up. The later rule silently does nothing.

Same family as the backdrop-filter dedupe: the authored CSS is right and the
compiled CSS is not what you wrote. When a rule that should obviously win does
not, read the compiled output before rewriting the source.

## CSS specificity ordering in globals.css

The mobile overrides sit in a large `@media (max-width: 768px)` block partway
through the file, but plenty of base rules are defined *after* it. Equal
specificity means the later rule wins, so an override placed in that block
silently loses to a base rule further down. When an override does not take,
check its position before its contents — put it directly after the rule it
overrides.

## Verify in the browser, not just with a green typecheck

Typecheck and lint pass on visually broken CSS. This branch shipped past a
green typecheck twice — a flex-wrap bug that un-pinned status badges, and the
backdrop-filter dedupe above. Screenshot it or read computed styles.

## Regex inside the layout.tsx inline script

Backslash escaping is fragile across template-literal rules and shell
heredocs. Prefer plain string methods (`indexOf`, `startsWith`) over regex
literals in that script.
