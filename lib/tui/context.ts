// Tiered context for the assistant.
//
// buildSnapshot() did the most expensive possible work on the cheapest
// possible turn: every inbound message — including a one-word "done" — fired
// 13 Supabase queries, a Xero token refresh plus REST call, and two IMAP
// logins before the model saw a single token. That is why replying to a text
// took ten seconds.
//
// The fix is not to make those calls faster, it is to notice that a reply to
// "done" does not need the retainer backlog, and nothing typed at 9pm needs a
// fresh IMAP login. Three tiers:
//
//   micro     inbound replies. Time, recent thread, open todos. Two queries,
//             no third-party calls, no joins.
//   standard  a client just did something. Adds the delivery signals — overdue
//             tasks, stalled jobs, missed deadlines, shoots with no prep,
//             backlog — plus cached connectivity.
//
// There used to be a third tier, `sweep`, which pulled Xero, unread mail and
// slow-moving growth signals (cold leads, stale proposals, dormant clients)
// for the daily digest. The digest is gone — it sent the same nag six times in
// a week — and with it the only caller of that tier, so the queries went too
// rather than sitting unreachable behind a branch nothing takes.
//
// Connectivity is read from integration_status, written by a health cron,
// rather than probed on the request path. Whether Xero is reachable is a
// property of the last few minutes, not of this turn, and finding out cost a
// token refresh and an IMAP login every single time.

import { getContentBacklog } from '@/lib/content-backlog'

export type ContextTier = 'micro' | 'standard'

export type AssistantTrigger = 'inbound' | 'event'

/**
 * An inbound reply is a conversation, not an audit. The daily digest is the
 * one turn that should look at everything, because it is the one turn whose
 * whole job is noticing what changed.
 *
 * An event turn already knows what happened — something pushed it. It needs
 * enough context to say something sensible about the surrounding job, not a
 * Xero refresh and two IMAP logins.
 */
export function tierForTrigger(trigger: AssistantTrigger): ContextTier {
  switch (trigger) {
    case 'inbound': return 'micro'
    case 'event': return 'standard'
  }
}

type Supa = any // eslint-disable-line @typescript-eslint/no-explicit-any

// Returns the snapshot as an object rather than a string. The flag sweep in
// lib/tui/flags.ts reads the same fields the model does, and re-parsing a
// string we had just serialised was pure ceremony.
export async function buildContext(
  supabase: Supa,
  tier: ContextTier,
  now: Date = new Date()
): Promise<Record<string, unknown>> {
  const todayISO = now.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const nowNZ = now.toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  // ── micro: always ───────────────────────────────────────────
  const [recentMessages, openTodos] = await Promise.all([
    supabase
      .from('sms_messages')
      .select('direction, body, created_at')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('todos')
      .select('id, title, due_date')
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
  ])

  const base: Record<string, unknown> = {
    context_tier: tier,
    today: todayISO,
    current_time_nz: nowNZ,
    open_todos: openTodos?.data ?? [],
    recent_messages_last_12_oldest_first: (recentMessages?.data ?? []).slice().reverse(),
  }

  if (tier === 'micro') return base

  // ── standard: delivery signals ──────────────────────────────
  const stale7d = new Date(now.getTime() - 7 * 86400000).toISOString()
  const shootWindow5d = new Date(now.getTime() + 5 * 86400000).toISOString().slice(0, 10)

  const [overdueTasks, stalledJobs, overdueDeadlines, shootsNeedingPrep, recentTicks, backlog] =
    await Promise.all([
      supabase
        .from('job_tasks')
        .select('id, title, due_date, jobs(id, name, status, clients(name))')
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
        .select('id, title, date, jobs(name)')
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
        .from('agent_ticks')
        .select('ran_at, reasoning, sms_sent, sms_body')
        .order('ran_at', { ascending: false })
        .limit(5),
      getContentBacklog(supabase, now).catch(() => null),
    ])

  Object.assign(base, {
    overdue_tasks: overdueTasks?.data ?? [],
    jobs_stalled_in_editing_or_review_7d_plus: stalledJobs?.data ?? [],
    overdue_deadline_events: overdueDeadlines?.data ?? [],
    shoots_soon_without_prep: shootsNeedingPrep?.data ?? [],
    retainer_content_backlog: backlog,
    recent_brain_ticks: recentTicks?.data ?? [],
  })

  // Connectivity comes last and costs one indexed read of a table a cron keeps
  // warm — no Xero token refresh, no IMAP login on the request path.
  Object.assign(base, { system_health: await readIntegrationStatus(supabase) })

  return base
}

/**
 * Connectivity as of the last health run, not as of this turn.
 *
 * The old code called getValidXeroAccount() and checkMailConnection() inline,
 * which meant a token refresh and an IMAP login on the request path purely to
 * answer "is this working". Both answers are minutes-stale by nature, so they
 * belong in a table that a cron keeps warm.
 *
 * Degrades to unknown-but-explicit if the table has not been created yet, so
 * the assistant says "I can't tell" rather than asserting a false healthy.
 */
async function readIntegrationStatus(supabase: Supa) {
  const { data, error } = await supabase
    .from('integration_status')
    .select('integration, ok, checked_at, detail')

  if (error) {
    return {
      note: 'Connectivity unknown — integration_status unavailable. Do not claim an integration is working or broken; say you cannot tell.',
    }
  }

  const rows = (data ?? []) as { integration: string; ok: boolean; checked_at: string; detail: string | null }[]
  const byName = Object.fromEntries(rows.map((r) => [r.integration, r]))
  return {
    xero: byName.xero ? { connected: byName.xero.ok, checked_at: byName.xero.checked_at, detail: byName.xero.detail } : null,
    email: byName.email ? { connected: byName.email.ok, checked_at: byName.email.checked_at, detail: byName.email.detail } : null,
    note: 'Checked by a health cron, not on this turn. A stale checked_at means the health cron itself has stopped.',
  }
}
