# Migrations

Everything in this folder is applied **automatically, on deploy**. You do not
open the Supabase SQL editor any more.

```bash
npm run migrate:new -- add brand column   # writes the file, correctly named
npm run migrate:status                    # what is applied, what is pending
npm run migrate                           # apply pending ones now
```

On Vercel, `vercel-build` runs `npm run migrate && next build`, so a deploy
cannot ship code that needs a column the database does not have yet — the
migration runs first, and a migration that fails fails the build.

## The one-time setup

`DATABASE_URL` must be set, locally in `.env` and in **Vercel → Settings →
Environment Variables** (all three environments). Get it from **Supabase →
Project Settings → Database → Connection string → URI**, using the **session
pooler** (port 5432), and put the database password in it.

Without it the runner prints a loud warning and skips — a deploy still ships,
it just does not migrate. That is deliberate: a database it cannot reach
should not take the site down with it.

## Rules

- **Files run in filename order.** `npm run migrate:new` handles the prefix.
- **A migration is immutable once applied.** The runner checksums every file
  and errors if one it has already run has changed. Fix a mistake with a new
  migration, never by editing an old one.
- **Each file runs in its own transaction.** A failure rolls that file back and
  stops the run; nothing after it is applied on top of a half-applied change.
- **Write them re-runnably anyway** (`if not exists`, `or replace`,
  `on conflict do nothing`). The runner guarantees once-only, but a migration
  you can safely re-run is one you can also paste into a fresh database.

## `supabase/migration_*.sql` (the older files)

Those are **history, and the runner never touches them.** They were all applied
by hand and most are not safe to re-run. Leave them where they are; they are
the record of how the schema got here. Anything new goes in this folder.
