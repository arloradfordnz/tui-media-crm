import ical, { type VEvent } from 'node-ical'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PUSHED_UID_PREFIX, runPushAndRecord } from '@/lib/icloud-push'

// Mirrors Arlo's iCloud work calendar into `events`, one way: phone → CRM.
//
// The calendar is shared from the iPhone as a public link (Calendar → the
// calendar's ⓘ → Public Calendar), which is saved in Settings. Nothing here
// writes back to iCloud. Rows from this sync carry source = 'icloud' and are
// rewritten from the phone on every run, so edits belong on the phone.
//
// There is no cron for this: Vercel's are daily, and "I just added it on my
// phone" needs minutes. Instead every dashboard request and Telegram message
// calls syncIcloudIfStale(), which costs one kv_cache read when it is fresh
// and runs a sync at most every SYNC_EVERY_MS otherwise.

export const ICLOUD_URL_SETTING = 'icloud_calendar_url'
const SYNCED_AT_KEY = 'icloud_calendar_synced_at'
const SYNC_EVERY_MS = 5 * 60 * 1000
const SOURCE = 'icloud'
export const ICLOUD_EVENT_TYPE = 'iphone'
const TZ = 'Pacific/Auckland'

// Past events are left alone once they fall out of this window, so history
// survives; anything inside it is made to match the phone exactly.
const WINDOW_PAST_DAYS = 30
const WINDOW_FUTURE_DAYS = 365
// A long all-day event (a week away) shows on each day, up to this many.
const MAX_DAYS_PER_EVENT = 14

type Row = {
  external_id: string
  title: string
  date: string
  start_time: string | null
  end_time: string | null
  notes: string | null
}

const text = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && 'val' in (v as object)) return String((v as { val: unknown }).val ?? '')
  return String(v)
}

const nzDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
const nzTime = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

// Same storage as an event made on the calendar page: the NZ day at UTC
// midnight in `date`, local wall-clock times as text.
const dayToDate = (day: string) => `${day}T00:00:00.000Z`

// An all-day value is a date, but the parser hands it back as the instant of
// that day's midnight in whichever zone it was read in. Reading it in NZ puts
// it back on the day it was written for (UTC would be a day early).
const allDayKey = (d: Date) => nzDay(d)

function rowsFor(uid: string, start: Date, end: Date | null, fullDay: boolean, title: string, notes: string | null): Row[] {
  const id = `${uid}:${start.toISOString()}`
  if (!fullDay) {
    return [{
      external_id: id,
      title,
      date: dayToDate(nzDay(start)),
      start_time: nzTime(start),
      end_time: end ? nzTime(end) : null,
      notes,
    }]
  }
  // All-day: DTEND is exclusive, so a one-day event ends the next midnight.
  const rows: Row[] = []
  const first = new Date(`${allDayKey(start)}T00:00:00Z`)
  const last = end ? new Date(`${allDayKey(end)}T00:00:00Z`) : new Date(first.getTime() + 86400000)
  for (let d = first, i = 0; d < last && i < MAX_DAYS_PER_EVENT; d = new Date(d.getTime() + 86400000), i++) {
    const day = d.toISOString().slice(0, 10)
    rows.push({ external_id: i === 0 ? id : `${id}:${day}`, title, date: dayToDate(day), start_time: null, end_time: null, notes })
  }
  if (rows.length === 0) rows.push({ external_id: id, title, date: dayToDate(allDayKey(start)), start_time: null, end_time: null, notes })
  return rows
}

export async function fetchIcloudRows(url: string, now = new Date()): Promise<Row[]> {
  // The share link is webcal://; it is plain HTTPS underneath.
  const httpsUrl = url.trim().replace(/^webcals?:\/\//i, 'https://')
  const res = await fetch(httpsUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`iCloud calendar returned ${res.status}`)
  const parsed = ical.sync.parseICS(await res.text())

  const from = new Date(now.getTime() - WINDOW_PAST_DAYS * 86400000)
  const to = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86400000)
  const rows: Row[] = []

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== 'VEVENT') continue
    const event = component as VEvent
    // A RECURRENCE-ID override is applied through its parent's expansion.
    if (event.recurrenceid) continue
    if (text(event.status).toUpperCase() === 'CANCELLED') continue
    // Pushed there from the CRM (lib/icloud-push.ts). Mirroring it back would
    // double it.
    if (event.uid?.startsWith(PUSHED_UID_PREFIX)) continue

    for (const inst of ical.expandRecurringEvent(event, { from, to, expandOngoing: true })) {
      const title = text(inst.summary) || 'Busy'
      const location = text(inst.event.location)
      const description = text(inst.event.description)
      const notes = [location, description].filter(Boolean).join('\n') || null
      rows.push(...rowsFor(event.uid, inst.start, inst.end ?? null, inst.isFullDay, title, notes))
    }
  }
  return rows
}

export async function syncIcloudCalendar(admin: SupabaseClient, now = new Date()): Promise<{ added: number; updated: number; removed: number } | null> {
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', ICLOUD_URL_SETTING).maybeSingle()
  const url = setting?.value as string | undefined

  // Stamp first, so a slow or failing iCloud is not retried by every request
  // that lands while this one is still running.
  await admin.from('kv_cache').upsert({ key: SYNCED_AT_KEY, value: { at: now.toISOString() }, updated_at: now.toISOString() })

  const windowStart = dayToDate(nzDay(new Date(now.getTime() - WINDOW_PAST_DAYS * 86400000)))
  const { data: existing } = await admin
    .from('events')
    .select('id, external_id, title, date, start_time, end_time, notes')
    .eq('source', SOURCE)
    .gte('date', windowStart)

  // Link removed: take the mirrored events back off the calendar.
  if (!url) {
    const ids = (existing ?? []).map((e) => e.id)
    if (ids.length) await admin.from('events').delete().in('id', ids)
    return ids.length ? { added: 0, updated: 0, removed: ids.length } : null
  }

  const wanted = new Map((await fetchIcloudRows(url, now)).map((r) => [r.external_id, r]))
  const have = new Map((existing ?? []).map((e) => [e.external_id as string, e]))

  const toInsert: Row[] = []
  const toUpdate: (Row & { id: string })[] = []
  for (const [key, row] of wanted) {
    const cur = have.get(key)
    if (!cur) { toInsert.push(row); continue }
    if (cur.title !== row.title || cur.start_time !== row.start_time || cur.end_time !== row.end_time
      || cur.notes !== row.notes || new Date(cur.date).getTime() !== new Date(row.date).getTime()) {
      toUpdate.push({ ...row, id: cur.id })
    }
  }
  const toDelete = [...have.entries()].filter(([key]) => !wanted.has(key)).map(([, e]) => e.id)

  await Promise.all([
    toInsert.length
      ? admin.from('events').insert(toInsert.map((r) => ({ ...r, source: SOURCE, event_type: ICLOUD_EVENT_TYPE })))
      : null,
    toDelete.length ? admin.from('events').delete().in('id', toDelete) : null,
    ...toUpdate.map(({ id, ...r }) => admin.from('events').update(r).eq('id', id)),
  ])

  return { added: toInsert.length, updated: toUpdate.length, removed: toDelete.length }
}

/** Sync unless the last one was under five minutes ago. Never throws. */
export async function syncIcloudIfStale(admin: SupabaseClient | null): Promise<void> {
  if (!admin) return
  try {
    const { data } = await admin.from('kv_cache').select('value').eq('key', SYNCED_AT_KEY).maybeSingle()
    const last = (data?.value as { at?: string } | null)?.at
    if (last && Date.now() - new Date(last).getTime() < SYNC_EVERY_MS) return
    // Phone → CRM, then CRM → phone. Each fails on its own: an expired Apple
    // password should not stop the phone's events arriving, and vice versa.
    try { await syncIcloudCalendar(admin) } catch (err) { console.error('[icloud-calendar] pull failed:', err) }
    await runPushAndRecord(admin)
  } catch (err) {
    console.error('[icloud-calendar] sync failed:', err)
  }
}
