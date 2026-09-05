// Real notification state for the proactive assistant.
//
// The old dedup was a paragraph of prompt: here are the last five brain ticks
// and the last twelve messages, please don't repeat yourself. That asks the
// model to re-derive, from prose, a fact the database already knows. It fails
// both ways — the same stalled job re-flagged because the wording drifted, and
// a worsening problem swallowed because something vaguely similar is in the
// scrollback.
//
// A flag is one concern with a stable identity. deriveFlags() mints those
// identities from the same snapshot the model sees; syncFlags() reconciles
// them against the assistant_flags table and answers the only question the
// tick actually has: what, right now, is worth interrupting Arlo about.
//
// See supabase/migration_assistant_flags.sql.

export type FlagKind =
  | 'overdue_task'
  | 'stalled_job'
  | 'missed_deadline'
  | 'unprepped_shoot'
  | 'content_backlog'
  | 'overdue_invoice'
  | 'cold_lead'
  | 'stale_proposal'
  | 'dormant_client'

export type DerivedFlag = {
  key: string
  kind: FlagKind
  subject: string
  severity: 'low' | 'normal' | 'high'
  detail?: Record<string, unknown>
}

export type FlagRow = DerivedFlag & {
  first_seen_at: string
  last_seen_at: string
  last_notified_at: string | null
  notify_count: number
  snooze_until: string | null
  resolved_at: string | null
}

// Escalating backoff, in hours, indexed by how many times this flag has
// already been raised. A standing problem should be mentioned again
// eventually, but a daily reminder about the same stalled edit is how a
// useful assistant becomes noise you learn to ignore. Past the end of the
// array, the last value repeats.
const BACKOFF_HOURS = [24, 72, 168, 336]

function backoffHours(notifyCount: number): number {
  return BACKOFF_HOURS[Math.min(notifyCount, BACKOFF_HOURS.length - 1)]
}

// A concern is worth raising if it has never been raised, or if the backoff
// for its current notify_count has elapsed. Snoozed and resolved flags are
// never eligible.
export function isDue(row: Pick<FlagRow, 'last_notified_at' | 'notify_count' | 'snooze_until' | 'resolved_at'>, now: Date): boolean {
  if (row.resolved_at) return false
  if (row.snooze_until && new Date(row.snooze_until) > now) return false
  if (!row.last_notified_at) return true
  const elapsedH = (now.getTime() - new Date(row.last_notified_at).getTime()) / 3600000
  return elapsedH >= backoffHours(row.notify_count)
}

// ── Derivation ──────────────────────────────────────────────────────────────

// Narrow row shapes, matching what buildContext selects. Deliberately loose:
// this reads a snapshot, and a missing section should cost its own flags
// rather than throwing.
type Named = { name?: string | null } | null
type Ctx = Record<string, unknown>

function arr<T>(ctx: Ctx, key: string): T[] {
  const v = ctx[key]
  return Array.isArray(v) ? (v as T[]) : []
}

function clientOf(row: { clients?: Named }): string {
  return row.clients?.name ?? 'unknown client'
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000)
}

/**
 * Turn a context snapshot into the set of concerns that are true right now.
 * Pure — no database, no clock beyond `now` — so it is testable and so the
 * same snapshot always produces the same keys.
 */
export function deriveFlags(ctx: Ctx, now: Date = new Date()): DerivedFlag[] {
  const flags: DerivedFlag[] = []

  for (const t of arr<{ id: string; title: string; due_date: string; jobs?: ({ name?: string | null; clients?: Named }) | null }>(ctx, 'overdue_tasks')) {
    const late = daysSince(t.due_date, now)
    flags.push({
      key: `overdue_task:${t.id}`,
      kind: 'overdue_task',
      subject: `"${t.title}"${t.jobs?.name ? ` on ${t.jobs.name}` : ''} was due ${t.due_date}${late && late > 0 ? `, ${late} days ago` : ''}`,
      severity: (late ?? 0) >= 7 ? 'high' : 'normal',
      detail: { task_id: t.id, due_date: t.due_date },
    })
  }

  for (const j of arr<{ id: string; name: string; status: string; updated_at: string; clients?: Named }>(ctx, 'jobs_stalled_in_editing_or_review_7d_plus')) {
    const idle = daysSince(j.updated_at, now)
    flags.push({
      key: `stalled_job:${j.id}`,
      kind: 'stalled_job',
      subject: `${j.name} (${clientOf(j)}) has sat in ${j.status} for ${idle ?? '7+'} days`,
      severity: (idle ?? 0) >= 21 ? 'high' : 'normal',
      detail: { job_id: j.id, status: j.status, idle_days: idle },
    })
  }

  for (const e of arr<{ id: string; title: string; date: string; jobs?: Named }>(ctx, 'overdue_deadline_events')) {
    flags.push({
      key: `missed_deadline:${e.id}`,
      kind: 'missed_deadline',
      subject: `Deadline "${e.title}"${e.jobs?.name ? ` on ${e.jobs.name}` : ''} passed on ${e.date}`,
      severity: 'high',
      detail: { event_id: e.id, date: e.date },
    })
  }

  for (const j of arr<{ id: string; name: string; shoot_date: string; status: string; clients?: Named }>(ctx, 'shoots_soon_without_prep')) {
    flags.push({
      key: `unprepped_shoot:${j.id}`,
      kind: 'unprepped_shoot',
      subject: `${j.name} (${clientOf(j)}) shoots ${j.shoot_date} and is still ${j.status}`,
      severity: 'high',
      detail: { job_id: j.id, shoot_date: j.shoot_date },
    })
  }

  // Backlog is keyed per client per month, not per client. A client who owed
  // July and now also owes August is genuinely two things to say, and the
  // August one has never been raised — which is exactly the case the old
  // prompt-based dedup swallowed.
  const backlog = ctx.retainer_content_backlog as {
    clients?: { clientId: string; clientName: string; months?: { month: string; label?: string; missing: number; isCurrentMonth: boolean; jobExists: boolean }[] }[]
  } | null | undefined

  for (const c of backlog?.clients ?? []) {
    for (const m of c.months ?? []) {
      if (m.isCurrentMonth || m.missing <= 0) continue
      flags.push({
        key: `content_backlog:${c.clientId}:${m.month}`,
        kind: 'content_backlog',
        subject: `${c.clientName} is owed ${m.missing} video${m.missing === 1 ? '' : 's'} from ${m.label ?? m.month}${m.jobExists ? '' : ' (no job was ever created for it)'}`,
        severity: 'high',
        detail: { client_id: c.clientId, month: m.month, missing: m.missing, job_exists: m.jobExists },
      })
    }
  }

  for (const inv of arr<{ number: string; amount_due: number; due_date?: string }>(ctx, 'overdue_xero_invoices')) {
    const late = daysSince(inv.due_date, now)
    flags.push({
      key: `overdue_invoice:${inv.number}`,
      kind: 'overdue_invoice',
      subject: `${inv.number} is $${inv.amount_due} unpaid, due ${inv.due_date}${late && late > 0 ? ` (${late} days ago)` : ''}`,
      severity: (late ?? 0) >= 30 ? 'high' : 'normal',
      detail: { invoice_number: inv.number, amount_due: inv.amount_due, days_late: late },
    })
  }

  for (const c of arr<{ id: string; name: string; pipeline_stage: string; updated_at: string }>(ctx, 'cold_pipeline_leads')) {
    flags.push({
      key: `cold_lead:${c.id}`,
      kind: 'cold_lead',
      subject: `${c.name} has been quiet in ${c.pipeline_stage} for ${daysSince(c.updated_at, now) ?? '5+'} days`,
      severity: 'low',
      detail: { client_id: c.id, stage: c.pipeline_stage },
    })
  }

  for (const p of arr<{ id: string; sent_at: string; total_value: number | null; jobs?: ({ name?: string | null; clients?: Named }) | null }>(ctx, 'proposals_awaiting_response')) {
    flags.push({
      key: `stale_proposal:${p.id}`,
      kind: 'stale_proposal',
      subject: `Proposal${p.jobs?.name ? ` for ${p.jobs.name}` : ''}${p.jobs?.clients?.name ? ` (${p.jobs.clients.name})` : ''} sent ${p.sent_at?.slice(0, 10)} with no reply`,
      severity: 'normal',
      detail: { proposal_id: p.id, value: p.total_value },
    })
  }

  for (const c of arr<{ id: string; name: string; updated_at: string }>(ctx, 'dormant_past_clients')) {
    flags.push({
      key: `dormant_client:${c.id}`,
      kind: 'dormant_client',
      subject: `${c.name} has been quiet for ${daysSince(c.updated_at, now) ?? '90+'} days and could be worth a nudge`,
      severity: 'low',
      detail: { client_id: c.id },
    })
  }

  return flags
}

// ── Reconciliation ──────────────────────────────────────────────────────────

type Supa = any // eslint-disable-line @typescript-eslint/no-explicit-any

export type FlagSync = {
  /** Worth raising on this turn: unresolved, unsnoozed, past its backoff. */
  due: (DerivedFlag & { first_seen_at: string; notify_count: number })[]
  /** True right now but deliberately held back, with the reason. */
  held: { key: string; subject: string; reason: 'recently_raised' | 'snoozed' }[]
  /** Conditions that went away since the last sweep. Worth a "that's sorted". */
  resolved: { key: string; subject: string }[]
  note?: string
}

/**
 * Reconcile the world as it is against the flags table, and return what the
 * assistant should actually say something about.
 *
 * Degrades to "raise everything, mention nothing about state" if the table is
 * missing, so a not-yet-run migration makes the assistant chattier rather than
 * silent. Silence is the failure mode that hides itself.
 */
export async function syncFlags(supabase: Supa, ctx: Ctx, now: Date = new Date()): Promise<FlagSync> {
  const derived = deriveFlags(ctx, now)
  const nowISO = now.toISOString()

  const { data, error } = await supabase
    .from('assistant_flags')
    .select('key, kind, subject, severity, first_seen_at, last_seen_at, last_notified_at, notify_count, snooze_until, resolved_at')

  if (error) {
    return {
      due: derived.map((f) => ({ ...f, first_seen_at: nowISO, notify_count: 0 })),
      held: [],
      resolved: [],
      note: 'assistant_flags unavailable — no notification history this turn. Fall back to recent_messages before repeating yourself.',
    }
  }

  const existing = new Map<string, FlagRow>(
    ((data ?? []) as FlagRow[]).map((r) => [r.key, r])
  )
  const derivedKeys = new Set(derived.map((f) => f.key))

  // Upsert every currently-true concern. Subject and severity are refreshed
  // because the underlying facts move ("7 days" becomes "12 days"), but
  // first_seen_at and the notification counters are never touched here.
  const upserts = derived.map((f) => {
    const prior = existing.get(f.key)
    return {
      key: f.key,
      kind: f.kind,
      subject: f.subject,
      severity: f.severity,
      detail: f.detail ?? null,
      first_seen_at: prior?.first_seen_at ?? nowISO,
      last_seen_at: nowISO,
      // A concern that comes back after being resolved is live again, but it
      // keeps its notification history — so a job that stalls, unstalls and
      // stalls again is not a fresh excuse to interrupt.
      resolved_at: null,
    }
  })

  if (upserts.length > 0) {
    const { error: upsertError } = await supabase
      .from('assistant_flags')
      .upsert(upserts, { onConflict: 'key' })
    if (upsertError) console.error('[flags] upsert failed:', upsertError.message)
  }

  // Anything previously open that no longer appears has genuinely gone away.
  const nowResolved = [...existing.values()].filter((r) => !r.resolved_at && !derivedKeys.has(r.key))
  if (nowResolved.length > 0) {
    const { error: resolveError } = await supabase
      .from('assistant_flags')
      .update({ resolved_at: nowISO })
      .in('key', nowResolved.map((r) => r.key))
    if (resolveError) console.error('[flags] resolve failed:', resolveError.message)
  }

  const due: FlagSync['due'] = []
  const held: FlagSync['held'] = []

  for (const f of derived) {
    const prior = existing.get(f.key)
    const state = {
      last_notified_at: prior?.last_notified_at ?? null,
      notify_count: prior?.notify_count ?? 0,
      snooze_until: prior?.snooze_until ?? null,
      resolved_at: null,
    }
    if (isDue(state, now)) {
      due.push({ ...f, first_seen_at: prior?.first_seen_at ?? nowISO, notify_count: state.notify_count })
    } else {
      held.push({
        key: f.key,
        subject: f.subject,
        reason: state.snooze_until && new Date(state.snooze_until) > now ? 'snoozed' : 'recently_raised',
      })
    }
  }

  // High severity first, then longest-standing — the order Arlo would want to
  // hear them in if only one gets said.
  const weight = { high: 0, normal: 1, low: 2 }
  due.sort((a, b) => weight[a.severity] - weight[b.severity] || a.first_seen_at.localeCompare(b.first_seen_at))

  return {
    due,
    held,
    resolved: nowResolved.map((r) => ({ key: r.key, subject: r.subject })),
  }
}

/**
 * Record that these flags were actually said out loud. Called after the
 * message is delivered, not before — a flag marked notified for a message that
 * failed to send is a concern silently buried for a day.
 */
export async function markNotified(supabase: Supa, keys: string[], now: Date = new Date()): Promise<void> {
  if (keys.length === 0) return
  const { data, error } = await supabase
    .from('assistant_flags')
    .select('key, notify_count')
    .in('key', keys)
  if (error) return

  await Promise.all(
    ((data ?? []) as { key: string; notify_count: number }[]).map((row) =>
      supabase
        .from('assistant_flags')
        .update({ last_notified_at: now.toISOString(), notify_count: row.notify_count + 1 })
        .eq('key', row.key)
    )
  )
}
