#!/usr/bin/env node
/**
 * Creates supabase/migrations/<YYYYMMDD>_<NNNN>_<name>.sql.
 *
 * The four-digit counter is per-day, so two migrations written on the same day
 * still have a definite order — a plain date prefix would leave it to however
 * the filesystem felt like sorting them.
 */
import { readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

const name = process.argv.slice(2).join(' ').trim()
if (!name) {
  console.error('usage: npm run migrate:new -- add-brand-column')
  process.exit(1)
}
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const d = new Date()
const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

const existing = (await readdir(DIR).catch(() => [])).filter((f) => f.startsWith(day))
const seq = String(existing.length + 1).padStart(4, '0')

const file = path.join(DIR, `${day}_${seq}_${slug}.sql`)
await writeFile(
  file,
  `-- ${name}\n--\n-- Runs once, automatically, on the next deploy. Write it so it can be read\n-- in a year: what changed and why, not just the DDL.\n\n`,
  { flag: 'wx' }
)
console.log(path.relative(process.cwd(), file))
