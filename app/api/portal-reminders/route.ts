import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendDeliveryReminderEmail, sendProposalFollowUpEmail, sendContractFollowUpEmail } from '@/lib/email'
import { secretMatches, hasCronBearer } from '@/lib/secure-compare'

// Daily follow-ups (vercel.json, 22:00 UTC, mid-morning in New Zealand) for
// anything a client has been sent and not answered:
//
//   proposals  sent, not accepted or declined
//   contracts  emailed, not signed
//   videos     delivered to the portal, not approved
//
// The first follow-up goes two days after it was sent, then at most every three
// days, and none once three weeks have passed: by then it needs Arlo, not
// another automatic email. Each email says whether the client has opened it.
//
// The video reminders used to be dead: the query asked for files still marked
// "sent" that had also been viewed, but viewing a file marks it "viewed", and
// it read a portal_token off jobs, which only clients have.

const FIRST_AFTER_DAYS = 2
const COOLDOWN_DAYS = 3
const GIVE_UP_AFTER_DAYS = 21
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role credentials missing')
  return createClient(url, key)
}

function isAuthorised(req: NextRequest) {
  if (secretMatches(req.nextUrl.searchParams.get('token'), process.env.BRIEFING_TOKEN)) return true
  return hasCronBearer(req)
}

type Client = { id: string; name: string; email: string | null; contact_person: string | null; portal_token: string | null }

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const now = Date.now()
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString()
  const firstCutoff = daysAgo(FIRST_AFTER_DAYS)
  const cooldownCutoff = daysAgo(COOLDOWN_DAYS)
  const giveUpCutoff = daysAgo(GIVE_UP_AFTER_DAYS)
  const stamp = new Date(now).toISOString()
  const due = (lastReminded: string | null) => !lastReminded || lastReminded < cooldownCutoff
  const greet = (c: Client) => c.contact_person?.split(' ')[0] || c.name

  const sent: { kind: string; what: string; to: string }[] = []
  const skipped: { kind: string; what: string; reason: string }[] = []
  const errors: string[] = []

  const [proposals, contracts, videos] = await Promise.all([
    supabase
      .from('proposals')
      .select('id, token, job_id, sent_at, viewed_at, last_reminded_at, jobs(name, clients(id, name, email, contact_person, portal_token))')
      .eq('status', 'sent')
      .lt('sent_at', firstCutoff)
      .gt('sent_at', giveUpCutoff),
    supabase
      .from('documents')
      .select('id, name, content, sent_at, viewed_at, last_reminded_at, clients(id, name, email, contact_person, portal_token)')
      .eq('doc_type', 'contract')
      .lt('sent_at', firstCutoff)
      .gt('sent_at', giveUpCutoff),
    supabase
      .from('delivery_files')
      .select('id, original_name, created_at, viewed_at, last_reminded_at, deliverables(job_id, jobs(name, clients(id, name, email, contact_person, portal_token)))')
      .in('delivery_status', ['sent', 'viewed'])
      .is('approved_at', null)
      .is('archived_at', null)
      .lt('created_at', firstCutoff)
      .gt('created_at', giveUpCutoff),
  ])
  for (const r of [proposals, contracts, videos]) if (r.error) errors.push(r.error.message)

  // ── Proposals ──────────────────────────────────────────────
  for (const p of (proposals.data ?? []) as unknown as { id: string; token: string; job_id: string; viewed_at: string | null; last_reminded_at: string | null; jobs: { name: string; clients: Client | null } | null }[]) {
    const job = p.jobs
    const client = job?.clients
    const what = job?.name ?? p.id
    if (!client?.email) { skipped.push({ kind: 'proposal', what, reason: 'no client email' }); continue }
    if (!due(p.last_reminded_at)) { skipped.push({ kind: 'proposal', what, reason: 'followed up recently' }); continue }
    await sendProposalFollowUpEmail(client.email, greet(client), job!.name, `${BASE_URL}/proposal/${p.token}`, !!p.viewed_at, client.id, p.job_id)
    await supabase.from('proposals').update({ last_reminded_at: stamp }).eq('id', p.id)
    sent.push({ kind: 'proposal', what, to: client.email })
  }

  // ── Contracts ──────────────────────────────────────────────
  for (const d of (contracts.data ?? []) as unknown as { id: string; name: string; content: string; viewed_at: string | null; last_reminded_at: string | null; clients: Client | null }[]) {
    let signed = false
    try { signed = Boolean(JSON.parse(d.content)?.form?.clientSignature) } catch { /* free text */ }
    if (signed) continue
    const client = d.clients
    if (!client?.email || !client.portal_token) { skipped.push({ kind: 'contract', what: d.name, reason: 'no client email or portal link' }); continue }
    if (!due(d.last_reminded_at)) { skipped.push({ kind: 'contract', what: d.name, reason: 'followed up recently' }); continue }
    await sendContractFollowUpEmail(client.email, greet(client), d.name, `${BASE_URL}/portal/client/${client.portal_token}`, !!d.viewed_at, client.id)
    await supabase.from('documents').update({ last_reminded_at: stamp }).eq('id', d.id)
    sent.push({ kind: 'contract', what: d.name, to: client.email })
  }

  // ── Videos ─────────────────────────────────────────────────
  // One email per job, however many files are waiting on it.
  const videosByJob = new Map<string, { ids: string[]; jobName: string; client: Client | null; viewedAt: string | null; reminded: string | null }>()
  for (const f of (videos.data ?? []) as unknown as { id: string; viewed_at: string | null; last_reminded_at: string | null; deliverables: { job_id: string; jobs: { name: string; clients: Client | null } | null } | null }[]) {
    const jobId = f.deliverables?.job_id
    if (!jobId) continue
    const entry = videosByJob.get(jobId) ?? { ids: [], jobName: f.deliverables?.jobs?.name ?? '', client: f.deliverables?.jobs?.clients ?? null, viewedAt: null, reminded: null }
    entry.ids.push(f.id)
    if (f.viewed_at && (!entry.viewedAt || f.viewed_at < entry.viewedAt)) entry.viewedAt = f.viewed_at
    if (f.last_reminded_at && (!entry.reminded || f.last_reminded_at > entry.reminded)) entry.reminded = f.last_reminded_at
    videosByJob.set(jobId, entry)
  }
  for (const [jobId, v] of videosByJob) {
    const client = v.client
    if (!client?.email || !client.portal_token) { skipped.push({ kind: 'video', what: v.jobName, reason: 'no client email or portal link' }); continue }
    if (!due(v.reminded)) { skipped.push({ kind: 'video', what: v.jobName, reason: 'followed up recently' }); continue }
    const daysSinceViewed = v.viewedAt ? Math.max(1, Math.floor((now - new Date(v.viewedAt).getTime()) / 86400000)) : null
    await sendDeliveryReminderEmail(client.email, greet(client), v.jobName, `${BASE_URL}/portal/client/${client.portal_token}`, daysSinceViewed, client.id, jobId)
    await supabase.from('delivery_files').update({ last_reminded_at: stamp }).in('id', v.ids)
    sent.push({ kind: 'video', what: v.jobName, to: client.email })
  }

  if (sent.length) {
    await supabase.from('activities').insert(sent.map((s) => ({ action: 'follow_up_sent', details: `Follow-up sent to ${s.to} about the ${s.kind} "${s.what}"` })))
  }

  return NextResponse.json({ ok: errors.length === 0, sent, skipped, errors }, { status: errors.length ? 500 : 200 })
}
