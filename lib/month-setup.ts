// Monthly retainer setup.
//
// Every retainer month used to be set up by hand, and usually late: October's
// content job for Johnson Residential was made on 20 November. Until a month's
// job exists the Retainers page counts that whole month as owed and the portal
// has nowhere to put the videos, so a forgotten setup reads as being behind.
//
// This runs from a daily cron (/api/retainer-month-setup). For each active,
// unpaused retainer client it makes the current month's job, named the way the
// content backlog reads it ("December Content"), with one deliverable per video
// owed. It is safe to run every day:
//
//   - a month that already has a job (made by hand or by an earlier run) is
//     left alone, matched with the same month parser the backlog uses
//   - each client is set up at most once per month, recorded in kv_cache, so
//     deleting an auto-made job (a skipped month) does not bring it back
//
// It does NOT raise invoices. Retainers are billed on the 1st by Xero
// repeating invoices, so a draft here would bill the client twice. Instead it
// reads those repeating invoices and reports any retainer that is not being
// billed, or is billed a different amount from the client record, plus any
// repeating invoice still running for a client that is paused or gone. The
// report is shown on Today (lib/attention.ts).

import { parseJobMonth } from './content-backlog'
import { fetchRepeatingInvoices } from './xero'

export const MONTH_SETUP_KEY = 'retainer_month_setup'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type MonthSetupReport = {
  /** '2026-12' */
  month: string
  /** 'December 2026' */
  label: string
  ranAt: string
  created: { clientId: string; clientName: string; jobId: string; jobName: string; videos: number }[]
  /** When this month's jobs were made, so Today can stop mentioning it after a week. */
  createdAt: string | null
  /** Retainer clients the setup could not do, with the reason in plain words. */
  skipped: { clientId: string; clientName: string; reason: string }[]
  /** Billing problems found in Xero's repeating invoices. */
  billing: { clientId: string | null; clientName: string; issue: string }[]
  /** False when Xero could not be read, so no billing check happened. */
  xeroChecked: boolean
  /** client ids set up per month, so a deleted job is not remade. */
  done: Record<string, string[]>
}

type RetainerClient = {
  id: string
  name: string
  status: string | null
  monthly_retainer: number | null
  videos_per_month: number | null
  shoots_per_month: number | null
  retainer_paused_from: string | null
  videos_open_ended: boolean | null
  is_volunteer: boolean | null
  xero_contact_ids: string[] | null
  jobs: { id: string; name: string; created_at: string | null }[] | null
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`

export async function runMonthSetup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: { now?: Date; dryRun?: boolean } = {},
): Promise<MonthSetupReport> {
  const now = opts.now ?? new Date()
  const nzNow = new Date(now.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }))
  const year = nzNow.getFullYear()
  const monthIdx = nzNow.getMonth()
  const month = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
  const label = `${MONTH_NAMES[monthIdx]} ${year}`
  const ranAt = now.toISOString()

  const [clientsRes, previousRes, repeating] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, status, monthly_retainer, videos_per_month, shoots_per_month, retainer_paused_from, videos_open_ended, is_volunteer, xero_contact_ids, jobs(id, name, created_at)')
      .eq('client_category', 'retainer'),
    admin.from('kv_cache').select('value').eq('key', MONTH_SETUP_KEY).maybeSingle(),
    fetchRepeatingInvoices(),
  ])
  if (clientsRes.error) throw new Error(`Could not read retainer clients: ${clientsRes.error.message}`)

  const clients = (clientsRes.data ?? []) as RetainerClient[]
  const previous = (previousRes.data?.value ?? null) as MonthSetupReport | null
  const done: Record<string, string[]> = { ...(previous?.done ?? {}) }
  // Keep a few months of history, not forever.
  for (const key of Object.keys(done).sort().slice(0, -3)) delete done[key]
  const doneThisMonth = new Set(done[month] ?? [])

  const isPaused = (c: RetainerClient) => !!c.retainer_paused_from && c.retainer_paused_from.slice(0, 7) <= month
  const running = clients.filter((c) => c.status === 'active' && !isPaused(c))

  const created: MonthSetupReport['created'] = previous?.month === month ? [...previous.created] : []
  const skipped: MonthSetupReport['skipped'] = []

  for (const c of running) {
    if (doneThisMonth.has(c.id)) continue

    const hasMonthJob = (c.jobs ?? []).some((j) => {
      const parsed = parseJobMonth(j.name, j.created_at)
      return parsed && parsed.year === year && parsed.monthIdx === monthIdx
    })
    if (hasMonthJob) {
      doneThisMonth.add(c.id)
      continue
    }

    const openEnded = !!c.videos_open_ended
    const videos = openEnded ? 0 : c.videos_per_month ?? 0
    if (!openEnded && videos < 1) {
      skipped.push({
        clientId: c.id,
        clientName: c.name,
        reason: `${c.name}'s ${MONTH_NAMES[monthIdx]} wasn't set up: no videos per month on their record`,
      })
      continue
    }

    const jobName = `${MONTH_NAMES[monthIdx]} Content`
    if (opts.dryRun) {
      created.push({ clientId: c.id, clientName: c.name, jobId: '(dry run)', jobName, videos })
      continue
    }

    const notes = [
      `Content month: ${label}`,
      openEnded ? 'Videos owed: no set number' : `Videos owed: ${videos}`,
      c.shoots_per_month ? `Shoots this month: ${c.shoots_per_month}` : null,
      `Set up automatically on ${nzNow.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long' })}.`,
    ].filter(Boolean).join('\n')

    const { data: job, error } = await admin.from('jobs').insert({
      name: jobName,
      client_id: c.id,
      job_type: 'social_media',
      status: 'booked',
      quote_value: c.is_volunteer ? null : c.monthly_retainer,
      notes,
    }).select('id').single()
    if (error || !job) {
      skipped.push({ clientId: c.id, clientName: c.name, reason: `${c.name}'s ${MONTH_NAMES[monthIdx]} job could not be made: ${error?.message ?? 'unknown error'}` })
      continue
    }

    await Promise.all([
      videos > 0
        ? admin.from('deliverables').insert(
            Array.from({ length: Math.min(videos, 24) }, (_, i) => ({
              job_id: job.id,
              title: `Social Media Video ${i + 1}`,
              description: `${label} content`,
            })),
          )
        : Promise.resolve(null),
      admin.from('activities').insert({
        action: 'job_created',
        details: `Job "${jobName}" created by the monthly retainer setup`,
        job_id: job.id,
        client_id: c.id,
      }),
    ])

    doneThisMonth.add(c.id)
    created.push({ clientId: c.id, clientName: c.name, jobId: job.id, jobName, videos })
  }

  // ── Billing check against Xero's repeating invoices ─────────────────────
  const billing: MonthSetupReport['billing'] = []
  if (repeating) {
    const live = repeating.filter((r) => r.status === 'AUTHORISED' || r.status === 'DRAFT')
    const matches = (c: RetainerClient, r: (typeof live)[number]) =>
      (c.xero_contact_ids ?? []).includes(r.contactId) || norm(c.name) === norm(r.contactName)
    const claimed = new Set<string>()

    for (const c of running) {
      const mine = live.filter((r) => matches(c, r))
      mine.forEach((r) => claimed.add(r.id))
      if (c.is_volunteer) continue
      if (mine.length === 0) {
        billing.push({ clientId: c.id, clientName: c.name, issue: `${c.name} has no repeating invoice in Xero, so ${MONTH_NAMES[monthIdx]} isn't billed` })
        continue
      }
      const billed = mine.reduce((sum, r) => sum + r.total, 0)
      if (c.monthly_retainer == null) {
        billing.push({ clientId: c.id, clientName: c.name, issue: `Xero bills ${c.name} ${money(billed)} a month, but their record has no retainer amount` })
      } else if (Math.abs(billed - c.monthly_retainer) > 0.5) {
        billing.push({ clientId: c.id, clientName: c.name, issue: `Xero bills ${c.name} ${money(billed)} a month, their record says ${money(c.monthly_retainer)}` })
      }
    }

    // A repeating invoice still running for a retainer that is paused, past or
    // archived bills someone for work that is not happening.
    for (const r of live) {
      if (claimed.has(r.id)) continue
      const owner = clients.find((c) => matches(c, r))
      if (!owner) continue
      const why = isPaused(owner) ? 'their retainer is paused' : `they're marked ${owner.status ?? 'inactive'}`
      billing.push({ clientId: owner.id, clientName: owner.name, issue: `Xero still bills ${owner.name} ${money(r.total)} a month, but ${why}` })
    }
  }

  done[month] = [...doneThisMonth]
  const newlyCreated = created.length > (previous?.month === month ? previous.created.length : 0)
  const report: MonthSetupReport = {
    month,
    label,
    ranAt,
    created,
    createdAt: newlyCreated ? ranAt : previous?.month === month ? previous.createdAt : null,
    skipped,
    billing,
    xeroChecked: repeating !== null,
    done,
  }

  if (!opts.dryRun) {
    await admin.from('kv_cache').upsert({ key: MONTH_SETUP_KEY, value: report, updated_at: ranAt })
  }
  return report
}
