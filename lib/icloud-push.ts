import { createHash } from 'node:crypto'
import { createDAVClient } from 'tsdav'
import type { SupabaseClient } from '@supabase/supabase-js'

// CRM → iPhone. Writes CRM-origin events into the iCloud work calendar over
// CalDAV, so the phone needs one calendar rather than a subscribed "Tui Media"
// one beside the real one. The opposite direction (phone → CRM) is
// lib/icloud-calendar.ts, and the two share a calendar: pushed events carry a
// UID starting PUSHED_UID_PREFIX, which the pull side skips so nothing loops.
//
// What is pushed: every events row with source IS NULL (shoots mirrored from
// jobs, manual events, whatever Tui creates). Rows mirrored FROM the phone
// (source = 'icloud') are never pushed back.
//
// Credentials: an Apple ID and an app-specific password, in integration_secrets
// (service role only). The chosen calendar's URL is in app_settings.

export const PUSHED_UID_PREFIX = 'crm-'
const UID_SUFFIX = '@tuimedia'
const TZ = 'Pacific/Auckland'
const SERVER = 'https://caldav.icloud.com'
const WINDOW_PAST_DAYS = 30
// iCloud rate-limits bursts, so a first run with a lot to write finishes over
// the next few syncs instead of in one go.
const MAX_OPS_PER_RUN = 30

export const SECRET_USER = 'icloud_caldav_user'
export const SECRET_PASSWORD = 'icloud_caldav_password'
export const SETTING_CALENDAR_URL = 'icloud_caldav_calendar_url'
export const SETTING_CALENDAR_NAME = 'icloud_caldav_calendar_name'
export const SETTING_CALENDARS = 'icloud_caldav_calendars'
export const STATUS_KEY = 'icloud_push_status'

export type CalendarChoice = { name: string; url: string }
export type PushResult = { created: number; updated: number; removed: number; remaining: number }

type EventRow = { id: string; title: string; date: string; start_time: string | null; end_time: string | null; notes: string | null }

// ── Time ─────────────────────────────────────────────────────────────────────

const nzDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })

// Offset of NZ from UTC at an instant, in ms (+12h or +13h).
function nzOffsetMs(utcMs: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  )
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs
}

/** NZ wall-clock day + 'HH:MM' → the UTC instant it means. */
export function nzWallToUtc(day: string, hhmm: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  return new Date(guess - nzOffsetMs(guess - nzOffsetMs(guess)))
}

const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsDay = (day: string) => day.replace(/-/g, '')

// ── ICS ──────────────────────────────────────────────────────────────────────

const escapeIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// RFC 5545 asks for lines of at most 75 octets, continued with a leading space.
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = Buffer.byteLength(ch)
    if (bytes + n > (out.length === 0 ? 75 : 74)) { out.push(cur); cur = ''; bytes = 0 }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

export const uidFor = (eventId: string) => `${PUSHED_UID_PREFIX}${eventId}${UID_SUFFIX}`

export function buildIcs(e: EventRow, now = new Date()): string {
  const day = nzDay(new Date(e.date))
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tui Media//CRM//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${uidFor(e.id)}`, `DTSTAMP:${icsUtc(now)}`, `SUMMARY:${escapeIcs(e.title)}`]

  if (e.start_time) {
    const start = nzWallToUtc(day, e.start_time)
    let end = e.end_time ? nzWallToUtc(day, e.end_time) : new Date(start.getTime() + 3600000)
    if (end <= start) end = new Date(start.getTime() + 3600000)
    lines.push(`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`)
  } else {
    const next = new Date(`${day}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${icsDay(day)}`, `DTEND;VALUE=DATE:${icsDay(next.toISOString().slice(0, 10))}`)
  }
  if (e.notes) lines.push(`DESCRIPTION:${escapeIcs(e.notes)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ── CalDAV ───────────────────────────────────────────────────────────────────

const authHeader = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

const BAD_LOGIN = 'Apple rejected the login. Check the Apple ID and that the password is an app-specific one, not your normal Apple password.'

/** The calendars on the account that can hold events. Throws on a bad login. */
export async function listCalendars(user: string, password: string): Promise<CalendarChoice[]> {
  try {
    const client = await createDAVClient({
      serverUrl: SERVER,
      credentials: { username: user, password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    })
    const calendars = await client.fetchCalendars()
    return calendars
      .filter((c) => !c.components || c.components.includes('VEVENT'))
      .map((c) => ({ name: typeof c.displayName === 'string' ? c.displayName : 'Calendar', url: c.url }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/401|unauthori|credential|login/i.test(msg)) throw new Error(BAD_LOGIN)
    throw new Error(`Could not reach iCloud: ${msg}`)
  }
}

async function dav(method: 'PUT' | 'DELETE', url: string, auth: string, body?: string) {
  // iCloud answers 500 now and then, and reliably when writes to one calendar
  // overlap (five parallel PUTs failed on the first real run; the same event
  // sent alone went through). So writes are sequential, and a 5xx gets two
  // more tries with a pause before it counts as a failure.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: auth, ...(body ? { 'Content-Type': 'text/calendar; charset=utf-8' } : {}) },
      body,
      signal: AbortSignal.timeout(15000),
    })
    if (res.status === 401) throw new Error(BAD_LOGIN)
    // A delete of something already gone is the outcome that was wanted.
    if (method === 'DELETE' && res.status === 404) return
    if (res.ok) return
    if (res.status >= 500 && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
    throw new Error(`iCloud answered ${res.status} to ${method}${detail ? `: ${detail}` : ''}`)
  }
}

const hrefFor = (calendarUrl: string, eventId: string) =>
  new URL(`${uidFor(eventId)}.ics`, calendarUrl.endsWith('/') ? calendarUrl : `${calendarUrl}/`).href

const hashOf = (e: EventRow, calendarUrl: string) =>
  createHash('sha1').update(JSON.stringify([e.title, nzDay(new Date(e.date)), e.start_time, e.end_time, e.notes, calendarUrl])).digest('hex')

// ── Sync ─────────────────────────────────────────────────────────────────────

export async function getCaldavConfig(admin: SupabaseClient) {
  const [{ data: secrets }, { data: settings }] = await Promise.all([
    admin.from('integration_secrets').select('key, value').in('key', [SECRET_USER, SECRET_PASSWORD]),
    admin.from('app_settings').select('key, value').in('key', [SETTING_CALENDAR_URL, SETTING_CALENDAR_NAME, SETTING_CALENDARS]),
  ])
  const s = Object.fromEntries((secrets ?? []).map((r) => [r.key, r.value as string]))
  const a = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value as string]))
  let calendars: CalendarChoice[] = []
  try { calendars = a[SETTING_CALENDARS] ? JSON.parse(a[SETTING_CALENDARS]) : [] } catch { /* treated as none */ }
  return {
    user: s[SECRET_USER] ?? '',
    password: s[SECRET_PASSWORD] ?? '',
    calendarUrl: a[SETTING_CALENDAR_URL] ?? '',
    calendarName: a[SETTING_CALENDAR_NAME] ?? '',
    calendars,
  }
}

/**
 * Bring the phone calendar in line with the CRM. `removeAll` takes everything
 * previously pushed back off the phone (used when disconnecting).
 */
export async function pushToIcloud(admin: SupabaseClient, opts: { removeAll?: boolean; now?: Date } = {}): Promise<PushResult | null> {
  const now = opts.now ?? new Date()
  const cfg = await getCaldavConfig(admin)
  if (!cfg.user || !cfg.password || (!cfg.calendarUrl && !opts.removeAll)) return null
  const auth = authHeader(cfg.user, cfg.password)

  const [{ data: events }, { data: pushed }] = await Promise.all([
    admin.from('events').select('id, title, date, start_time, end_time, notes').is('source', null),
    admin.from('icloud_push').select('event_id, href, hash'),
  ])
  const live = new Map((events ?? []).map((e) => [e.id as string, e as EventRow]))
  const have = new Map((pushed ?? []).map((p) => [p.event_id as string, p]))
  const windowStart = now.getTime() - WINDOW_PAST_DAYS * 86400000

  type Op =
    | { kind: 'delete'; id: string; href: string }
    | { kind: 'put'; id: string; href: string; hash: string; event: EventRow; fresh: boolean }
  const ops: Op[] = []

  for (const [id, p] of have) {
    const wrongPlace = !!cfg.calendarUrl && !p.href.startsWith(cfg.calendarUrl)
    if (opts.removeAll || !live.has(id) || wrongPlace) ops.push({ kind: 'delete', id, href: p.href })
  }
  if (!opts.removeAll) {
    for (const [id, event] of live) {
      const p = have.get(id)
      const moving = !!p && !p.href.startsWith(cfg.calendarUrl)
      const hash = hashOf(event, cfg.calendarUrl)
      if (p && !moving && p.hash === hash) continue
      // Past events that never made it to the phone stay off it.
      if (!p && new Date(event.date).getTime() < windowStart) continue
      ops.push({ kind: 'put', id, href: hrefFor(cfg.calendarUrl, id), hash, event, fresh: !p || moving })
    }
  }

  const batch = ops.slice(0, MAX_OPS_PER_RUN)
  const result: PushResult = { created: 0, updated: 0, removed: 0, remaining: ops.length - batch.length }

  // One at a time — see dav() for why not in parallel.
  for (const op of batch) {
    await (async () => {
      if (op.kind === 'delete') {
        await dav('DELETE', op.href, auth)
        // A moved event is re-created by its own put; only a true removal
        // forgets it, otherwise the put below would find no row to update.
        if (opts.removeAll || !live.has(op.id)) await admin.from('icloud_push').delete().eq('event_id', op.id)
        result.removed++
        return
      }
      await dav('PUT', op.href, auth, buildIcs(op.event, now))
      await admin.from('icloud_push').upsert({ event_id: op.id, href: op.href, hash: op.hash, pushed_at: now.toISOString() })
      if (op.fresh) result.created++; else result.updated++
    })()
  }
  return result
}

/** Records how the last push went, for the Settings card. Never throws. */
export async function runPushAndRecord(admin: SupabaseClient, opts?: Parameters<typeof pushToIcloud>[1]): Promise<PushResult | null> {
  const at = new Date().toISOString()
  try {
    const r = await pushToIcloud(admin, opts)
    if (r) await admin.from('kv_cache').upsert({ key: STATUS_KEY, value: { at, ok: true, ...r }, updated_at: at })
    return r
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[icloud-push] failed:', error)
    await admin.from('kv_cache').upsert({ key: STATUS_KEY, value: { at, ok: false, error }, updated_at: at })
    return null
  }
}
