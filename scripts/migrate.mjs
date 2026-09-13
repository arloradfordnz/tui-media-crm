#!/usr/bin/env node
/**
 * Applies every pending file in supabase/migrations/ and records what it ran.
 *
 * This exists because migrations were being applied BY HAND in the Supabase
 * SQL editor, which has two failure modes that both actually happened: a file
 * gets committed and never run (the app then reads a column that isn't there),
 * or it gets run twice. Nothing anywhere recorded which had been applied, so
 * the only way to know was to go and look at the table.
 *
 * ── The rules ─────────────────────────────────────────────────────────────
 *
 * 1. Only supabase/migrations/ is ever executed. The older
 *    supabase/migration_*.sql files are history — most are not safe to re-run
 *    and every one of them is already applied to the live database. They are
 *    deliberately NOT baselined into schema_migrations, because the runner
 *    never looks at them in the first place.
 *
 * 2. Files run in filename order, so the YYYYMMDD_NNNN_ prefix is the
 *    ordering. `npm run migrate:new <name>` generates it for you.
 *
 * 3. Each file runs inside its own transaction. A file that fails leaves
 *    nothing behind and stops the run — later migrations do not get applied
 *    on top of a half-applied one.
 *
 * 4. A session-level advisory lock means two deploys building at once cannot
 *    both apply the same migration. The second waits, then finds nothing
 *    pending.
 *
 * 5. Applied files are checksummed. Editing a migration that has already run
 *    is an error rather than a silent no-op — the fix is a new migration.
 */

import { readdir, readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(HERE, '..', 'supabase', 'migrations')

// Chosen once, arbitrary, and must never change: two runners agree they are
// talking about the same lock by using the same number.
const LOCK_KEY = 8274510923847

const args = new Set(process.argv.slice(2))
const STATUS_ONLY = args.has('--status')
const DRY_RUN = args.has('--dry-run')

function loadEnv() {
  // Vercel and the shell provide DATABASE_URL directly. Locally it comes from
  // .env, which Next loads for the app but not for a plain node script.
  if (process.env.DATABASE_URL) return
  try {
    const dotenv = readFileSync(path.join(HERE, '..', '.env'), 'utf8')
    for (const line of dotenv.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // No .env — fine, the variable may simply not be set.
  }
}

async function migrationFiles() {
  let entries = []
  try {
    entries = await readdir(MIGRATIONS_DIR)
  } catch {
    return []
  }
  return entries.filter((f) => f.endsWith('.sql')).sort()
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

async function main() {
  loadEnv()

  const files = await migrationFiles()
  if (files.length === 0) {
    console.log('[migrate] no migrations in supabase/migrations/ — nothing to do')
    return
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    // Deliberately not a build-breaking error. A deploy that cannot reach the
    // database should still ship the app; what it must not do is ship it
    // silently, so this is as loud as a non-fatal message gets.
    console.warn(
      '\n[migrate] ⚠ DATABASE_URL is not set — SKIPPING ' + files.length + ' migration file(s).\n' +
      '[migrate]   The app will deploy, but any column these add will be missing.\n' +
      '[migrate]   Set DATABASE_URL to the Supabase connection string\n' +
      '[migrate]   (Supabase → Project Settings → Database → Connection string → URI,\n' +
      '[migrate]   session pooler) in Vercel and in .env.\n'
    )
    return
  }

  const client = new pg.Client({
    connectionString: url,
    // Supabase terminates TLS at the pooler with a cert this client has no
    // root for. The connection is still encrypted.
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename    text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      )
    `)

    const { rows: applied } = await client.query('select filename, checksum from schema_migrations')
    const appliedBy = new Map(applied.map((r) => [r.filename, r.checksum]))

    const pending = []
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      const checksum = sha(sql)
      const prior = appliedBy.get(file)
      if (prior === undefined) {
        pending.push({ file, sql, checksum })
      } else if (prior !== checksum) {
        throw new Error(
          `${file} has changed since it was applied (${prior} → ${checksum}).\n` +
          `A migration is immutable once it has run. Write a new one instead.`
        )
      }
    }

    if (STATUS_ONLY) {
      console.log(`[migrate] ${applied.length} applied, ${pending.length} pending`)
      for (const { file } of pending) console.log(`  pending  ${file}`)
      return
    }

    if (pending.length === 0) {
      console.log(`[migrate] up to date (${applied.length} applied)`)
      return
    }

    if (DRY_RUN) {
      console.log(`[migrate] would apply ${pending.length}:`)
      for (const { file } of pending) console.log(`  ${file}`)
      return
    }

    // Blocks rather than failing, so a second concurrent deploy queues behind
    // the first instead of racing it.
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY])

    try {
      for (const { file, sql, checksum } of pending) {
        // Re-check inside the lock: the run we queued behind may have applied it.
        const { rowCount } = await client.query('select 1 from schema_migrations where filename = $1', [file])
        if (rowCount > 0) {
          console.log(`[migrate] ${file} — applied by a concurrent run, skipping`)
          continue
        }

        process.stdout.write(`[migrate] applying ${file} … `)
        await client.query('begin')
        try {
          await client.query(sql)
          await client.query(
            'insert into schema_migrations (filename, checksum) values ($1, $2)',
            [file, checksum]
          )
          await client.query('commit')
          console.log('ok')
        } catch (e) {
          await client.query('rollback')
          console.log('FAILED')
          throw new Error(`${file} failed and was rolled back:\n${e.message}`)
        }
      }
      console.log(`[migrate] done`)
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY])
    }
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(`\n[migrate] ${e.message}\n`)
  process.exit(1)
})
