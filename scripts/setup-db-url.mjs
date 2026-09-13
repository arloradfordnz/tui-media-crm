#!/usr/bin/env node
/**
 * One-time: puts DATABASE_URL in .env so migrations can run.
 *
 * You paste the connection string; this checks it actually connects, writes it
 * to .env (which is gitignored), and tells you what to put in Vercel. The
 * string is read with the terminal's echo turned off, so the password in it is
 * never shown on screen, printed back, or written to shell history.
 *
 *     npm run migrate:setup
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import path from 'node:path'
import pg from 'pg'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(ROOT, '.env')

function projectRef() {
  try {
    const env = readFileSync(ENV_FILE, 'utf8')
    const m = env.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?https:\/\/([a-z0-9]+)\.supabase\.co/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Reads a line with echo suppressed, so a pasted secret does not end up
 * visible on screen or in the terminal's scrollback.
 */
function askSecret(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // readline still echoes, so redraw the bare prompt after every keystroke.
    const onData = () => {
      readline.clearLine(process.stdout, 0)
      readline.cursorTo(process.stdout, 0)
      process.stdout.write(question)
    }
    process.stdin.on('data', onData)
    rl.question(question, (answer) => {
      process.stdin.off('data', onData)
      rl.close()
      process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

const ref = projectRef()

console.log([
  '',
  '--------------------------------------------------------------------',
  ' Connecting the migration runner to Supabase',
  '--------------------------------------------------------------------',
  '',
  'In Supabase, open:',
  '',
  '  Project Settings -> Database -> Connection string -> URI',
  '  and choose the "Session pooler" tab (port 5432).',
  '',
  ref ? `  Your project ref is ${ref} - check the string contains it.\n` : '',
  'Copy that string, replace [YOUR-PASSWORD] with your database password,',
  'and paste the whole thing below. It is not echoed to the screen and it',
  'is written only to .env, which git ignores.',
  '',
].join('\n'))

const url = await askSecret('Connection string: ')

if (!url) {
  console.error('Nothing pasted - stopping without changing anything.')
  process.exit(1)
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error('That does not look like a postgres:// connection string. Nothing was written.')
  process.exit(1)
}
if (url.includes('[YOUR-PASSWORD]')) {
  console.error('The [YOUR-PASSWORD] placeholder is still in there - replace it with the real password first.')
  process.exit(1)
}

process.stdout.write('Testing the connection ... ')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  const { rows } = await client.query('select current_database() db, current_user usr')
  await client.end()
  console.log(`ok (${rows[0].db} as ${rows[0].usr})`)
} catch (e) {
  console.log('FAILED')
  console.error(`\n  ${e.message}\n\nNothing was written to .env.`)
  process.exit(1)
}

// Replace an existing DATABASE_URL line rather than appending a second one.
let env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
const line = `DATABASE_URL="${url}"`
if (/^DATABASE_URL\s*=/m.test(env)) {
  env = env.replace(/^DATABASE_URL\s*=.*$/m, line)
} else {
  env = env.replace(/\n*$/, '\n') + `\n# Migration runner - see supabase/migrations/README.md\n${line}\n`
}
writeFileSync(ENV_FILE, env)
console.log('Written to .env')

console.log([
  '',
  'Now do the same in Vercel so deploys migrate themselves:',
  '',
  '  Vercel -> your project -> Settings -> Environment Variables',
  '  Name:  DATABASE_URL',
  '  Value: (the same string)',
  '  Environments: Production, Preview, Development',
  '',
  'Then run:  npm run migrate',
  '',
].join('\n'))
