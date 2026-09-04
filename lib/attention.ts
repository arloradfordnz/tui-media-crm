// The attention model: what actually needs Arlo today, as typed buckets.
//
// This logic already existed — buried inside buildSnapshot() in
// lib/assistant-agent.ts, where it was computed on every inbound text and
// shipped to Telegram as prose. The dashboard, meanwhile, fetched today's
// shoots, upcoming events and recent activity and rendered none of them.
// So the app was doing the work twice and showing it once, in the surface
// you read second.
//
// Everything here is CRM-only: Supabase queries and pure functions, no Xero
// and no IMAP. That is deliberate. Those are slow, uncached on cold start and
// fail independently, and blocking first paint on them is what made the
// dashboard feel dead. Xero-derived figures load separately behind Suspense.
//
// assistant-agent.ts is NOT yet rewired through this module. Phase 3 rebuilds
// the assistant's context layer wholesale (tiering it micro/standard/sweep),
// so pointing it here now would only mean moving it twice — and that file has
// active work in it from another session.

import { getContentBacklog, type ContentBacklog } from './content-backlog'

export type Severity = 'urgent' | 'due' | 'watch'

export type AttentionItem = {
  id: string
  kind: string
  severity: Severity
  /** One sentence. This is the whole item — there is no second line. */
  sentence: string
  /** The single thing to do about it. */
  action: { label: string; href: string }
  /** Short muted qualifier: a date, an amount, a count. */
  meta?: string
}

export type TodayEvent = {
  id: string
  title: string
  eventType: string
  startTime: string | null
  endTime: string | null
  job: { id: string; name: string } | null
}

export type Attention = {
  todayISO: string
  todayLabel: string
  todayEvents: TodayEvent[]
  hasShootToday: boolean
  /** Ranked: urgent, then due, then watch. Renderers slice this. */
  items: AttentionItem[]
  backlog: ContentBacklog | null
}

const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, due: 1, watch: 2 }

function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`
}

/** Whole days between an ISO date and today, positive = in the past. */
function daysAgo(iso: string | null, todayISO: string): number {
  if (!iso) return 0
  const a = new Date(iso.slice(0, 10)).getTime()
  const b = new Date(todayISO).getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * Build the attention model.
 *
 * `now` is injectable so the caller owns the timezone reference — "is this
 * overdue?" is a question about the local date, not UTC. Every caller passes
 * NZ wall-clock, matching lib/content-backlog.ts.
 */
export async function getAttention(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date = new Date()
): Promise<Attention> {
  const nzNow = new Date(now.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }))
  const todayISO = nzNow.toLocaleDateString('en-CA')
  const todayLabel = nzNow.toLocaleDateString('en-NZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const dayStart = new Date(nzNow.getFullYear(), nzNow.getMonth(), nzNow.getDate()).toISOString()
  const dayEnd = new Date(nzNow.getFullYear(), nzNow.getMonth(), nzNow.getDate() + 1).toISOString()
  const stale7d = new Date(now.getTime() - 7 * 86400000).toISOString()
  const staleLead5d = new Date(now.getTime() - 5 * 86400000).toISOString()
  const shootWindow5d = new Date(now.getTime() + 5 * 86400000).toISOString().slice(0, 10)
  const staleProposal4d = new Date(now.getTime() - 4 * 86400000).toISOString()

  const [
    todayEventsRes,
    overdueTasksRes,
    stalledJobsRes,
    overdueDeadlinesRes,
    shootsNeedingPrepRes,
    staleProposalsRes,
    coldLeadsRes,
    backlog,
  ] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, event_type, start_time, end_time, job_id, jobs(id, name)')
      .gte('date', dayStart)
      .lt('date', dayEnd)
      .order('start_time', { ascending: true }),
    supabase
      .from('job_tasks')
      .select('id, title, due_date, jobs(id, name, clients(name))')
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lte('due_date', todayISO)
      .order('due_date')
      .limit(20),
    supabase
      .from('jobs')
      .select('id, name, status, updated_at, clients(name)')
      .in('status', ['editing', 'review'])
      .lt('updated_at', stale7d)
      .order('updated_at')
      .limit(20),
    supabase
      .from('events')
      .select('id, title, date, job_id, jobs(id, name)')
      .eq('event_type', 'deadline')
      .lt('date', todayISO)
      .order('date')
      .limit(10),
    supabase
      .from('jobs')
      .select('id, name, shoot_date, status, clients(name)')
      .not('shoot_date', 'is', null)
      .gte('shoot_date', todayISO)
      .lte('shoot_date', shootWindow5d)
      .in('status', ['enquiry', 'booked'])
      .order('shoot_date')
      .limit(10),
    supabase
      .from('proposals')
      .select('id, status, sent_at, total_value, job_id, jobs(id, name, clients(name))')
      .eq('status', 'sent')
      .lt('sent_at', staleProposal4d)
      .is('responded_at', null)
      .order('sent_at')
      .limit(10),
    supabase
      .from('clients')
      .select('id, name, pipeline_stage, updated_at')
      .eq('status', 'lead')
      .in('pipeline_stage', ['enquiry', 'discovery', 'proposal', 'negotiation'])
      .lt('updated_at', staleLead5d)
      .order('updated_at')
      .limit(10),
    // Best-effort: the backlog costs two nested queries, and losing it should
    // cost the backlog line, not the whole page.
    getContentBacklog(supabase, now).catch(() => null),
  ])

  const items: AttentionItem[] = []

  // ── Overdue tasks ───────────────────────────────────────────
  for (const t of (overdueTasksRes?.data ?? []) as {
    id: string; title: string; due_date: string
    jobs: { id: string; name: string; clients: { name: string } | null } | null
  }[]) {
    const late = daysAgo(t.due_date, todayISO)
    items.push({
      id: `task:${t.id}`,
      kind: 'overdue_task',
      severity: 'urgent',
      sentence: `${t.title}${t.jobs ? ` — ${t.jobs.name}` : ''}`,
      action: { label: 'Open job', href: t.jobs ? `/dashboard/jobs/${t.jobs.id}` : '/dashboard/jobs' },
      meta: late <= 0 ? 'due today' : `${plural(late, 'day')} overdue`,
    })
  }

  // ── Overdue deadline events ─────────────────────────────────
  for (const e of (overdueDeadlinesRes?.data ?? []) as {
    id: string; title: string; date: string; jobs: { id: string; name: string } | null
  }[]) {
    items.push({
      id: `deadline:${e.id}`,
      kind: 'overdue_deadline',
      severity: 'urgent',
      sentence: `Deadline passed: ${e.title}`,
      action: { label: 'Open calendar', href: '/dashboard/calendar' },
      meta: `${plural(daysAgo(e.date, todayISO), 'day')} ago`,
    })
  }

  // ── Shoots close with nothing organised ─────────────────────
  for (const j of (shootsNeedingPrepRes?.data ?? []) as {
    id: string; name: string; shoot_date: string; status: string; clients: { name: string } | null
  }[]) {
    const days = -daysAgo(j.shoot_date, todayISO)
    items.push({
      id: `prep:${j.id}`,
      kind: 'shoot_without_prep',
      severity: 'urgent',
      sentence: `${j.clients?.name ?? j.name} shoots ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${plural(days, 'day')}`} but is still ${j.status}`,
      action: { label: 'Open job', href: `/dashboard/jobs/${j.id}` },
    })
  }

  // ── Retainer videos owed ────────────────────────────────────
  if (backlog && backlog.totals.videos_owed > 0) {
    items.push({
      id: 'backlog',
      kind: 'content_backlog',
      severity: 'due',
      sentence: `${plural(backlog.totals.videos_owed, 'video')} owed across ${plural(backlog.totals.clients_behind, 'client')}`,
      action: { label: 'Open retainers', href: '/dashboard/retainers' },
      meta: backlog.totals.months_never_started > 0
        ? `${plural(backlog.totals.months_never_started, 'month')} never set up`
        : undefined,
    })
  }

  // ── Jobs sitting still ──────────────────────────────────────
  for (const j of (stalledJobsRes?.data ?? []) as {
    id: string; name: string; status: string; updated_at: string; clients: { name: string } | null
  }[]) {
    items.push({
      id: `stalled:${j.id}`,
      kind: 'stalled_job',
      severity: 'due',
      sentence: `${j.name} has sat in ${j.status} untouched`,
      action: { label: 'Open job', href: `/dashboard/jobs/${j.id}` },
      meta: `${plural(daysAgo(j.updated_at, todayISO), 'day')}`,
    })
  }

  // ── Proposals with no reply ─────────────────────────────────
  for (const p of (staleProposalsRes?.data ?? []) as {
    id: string; sent_at: string; total_value: number | null
    jobs: { id: string; name: string; clients: { name: string } | null } | null
  }[]) {
    items.push({
      id: `proposal:${p.id}`,
      kind: 'stale_proposal',
      severity: 'due',
      sentence: `${p.jobs?.clients?.name ?? p.jobs?.name ?? 'A proposal'} hasn't replied to their proposal`,
      action: {
        label: 'Open job',
        href: p.jobs ? `/dashboard/jobs/${p.jobs.id}` : '/dashboard/jobs',
      },
      meta: `sent ${plural(daysAgo(p.sent_at, todayISO), 'day')} ago`,
    })
  }

  // ── Leads gone quiet ────────────────────────────────────────
  for (const c of (coldLeadsRes?.data ?? []) as {
    id: string; name: string; pipeline_stage: string; updated_at: string
  }[]) {
    items.push({
      id: `lead:${c.id}`,
      kind: 'cold_lead',
      severity: 'watch',
      sentence: `${c.name} has gone quiet at ${c.pipeline_stage}`,
      action: { label: 'Open client', href: `/dashboard/clients/${c.id}` },
      meta: `${plural(daysAgo(c.updated_at, todayISO), 'day')} since contact`,
    })
  }

  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  const todayEvents = ((todayEventsRes?.data ?? []) as {
    id: string; title: string; event_type: string
    start_time: string | null; end_time: string | null
    jobs: { id: string; name: string } | null
  }[]).map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.event_type,
    startTime: e.start_time,
    endTime: e.end_time,
    job: e.jobs ?? null,
  }))

  return {
    todayISO,
    todayLabel,
    todayEvents,
    hasShootToday: todayEvents.some((e) => e.eventType === 'shoot'),
    items,
    backlog,
  }
}
