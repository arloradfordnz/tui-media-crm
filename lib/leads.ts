// The leads board: who to reply to, who to nudge, who to leave for now.
//
// Leads live in hello@tuimedia.nz, not the CRM. Arlo files replies by hand
// under "02 Leads/Cold" and "02 Leads/Warm" (sub-folders named after the
// business), and the cold pitches ("Locally filmed video ads for X?", "More
// enquiries for X?", "More bookings for X?") sit in Sent. syncLeads() reads
// envelopes only from those folders and Sent, read-only, and keeps one row per
// address in the `leads` table. The mail fields are rewritten each sync; what
// Arlo sets (follow-up date, dropped, note, the nudge draft) is never touched.
//
// The stage is worked out when the board renders, from the mail and the
// follow-up date, so it never goes stale between syncs.

import Anthropic from '@anthropic-ai/sdk'
import type { ImapFlow } from 'imapflow'
import { withClient, resolveSentMailbox, fetchMailboxEnvelopes, pickTextPart, readPartText, type EmailSummary } from './mail'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const LEADS_SYNCED_KEY = 'leads_synced_at'
const SYNC_EVERY_MS = 60 * 60 * 1000

/** Days after Arlo's last email before a lead is due a nudge. */
export const NUDGE_AFTER_DAYS = 7
/** A pitch nudged this many times with nothing back has gone quiet. */
const QUIET_AFTER_EMAILS = 3
/** No mail either way for this long and a lead has gone quiet. */
const QUIET_AFTER_DAYS = 90

const PITCH_RE = /^(?:re:\s*)?(locally filmed video ads for|more enquiries for|more bookings for)\s+(.+?)\??\s*$/i
const OWN_ADDRESS_RE = /@tuimedia\.nz$|^arloradford\.nz@gmail\.com$/i

export type LeadRow = {
  id: string
  email: string
  name: string | null
  organisation: string | null
  temperature: 'warm' | 'cold' | 'pitched'
  last_subject: string | null
  last_in_at: string | null
  last_out_at: string | null
  messages_in: number
  messages_out: number
  follow_up_on: string | null
  status: 'open' | 'dropped' | 'won'
  note: string | null
  client_id: string | null
  nudge_draft: string | null
  nudge_drafted_at: string | null
  clients?: { id: string; name: string; status: string | null } | null
}

export type LeadStage = 'reply' | 'nudge' | 'later' | 'quiet' | 'dropped' | 'client'

export type Lead = LeadRow & { stage: LeadStage; dueOn: string | null; label: string }

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

export function nzToday(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
}

export function stageOf(row: LeadRow, today: string): Lead {
  const label = row.organisation || row.name || row.email
  const base = { ...row, label }
  if (row.status === 'dropped' || row.status === 'won') return { ...base, stage: 'dropped', dueOn: null }
  // Already a working client: the CRM has it, the board doesn't need to.
  if (row.clients && ['active', 'past'].includes(row.clients.status ?? '')) return { ...base, stage: 'client', dueOn: null }

  const inAt = row.last_in_at ? Date.parse(row.last_in_at) : 0
  const outAt = row.last_out_at ? Date.parse(row.last_out_at) : 0
  const todayAt = Date.parse(`${today}T00:00:00Z`)
  // Nothing either way for months: not worth a nudge out of the blue. Later
  // still brings one back, because a follow-up date outranks this.
  if (!row.follow_up_on && todayAt - Math.max(inAt, outAt) > QUIET_AFTER_DAYS * 86400000) {
    return { ...base, stage: 'quiet', dueOn: null }
  }
  // They wrote last and nobody has answered: that is not a nudge, it's a reply.
  if (inAt > outAt && !row.follow_up_on) return { ...base, stage: 'reply', dueOn: row.last_in_at!.slice(0, 10) }

  const dueOn = row.follow_up_on ?? (row.last_out_at ? addDays(row.last_out_at, NUDGE_AFTER_DAYS) : today)
  if (!row.follow_up_on && row.messages_in === 0 && row.messages_out >= QUIET_AFTER_EMAILS) {
    return { ...base, stage: 'quiet', dueOn: null }
  }
  return { ...base, stage: dueOn <= today ? 'nudge' : 'later', dueOn }
}

export async function getLeads(db: Db, now = new Date()): Promise<Lead[]> {
  const { data } = await db
    .from('leads')
    .select('*, clients(id, name, status)')
    .order('last_in_at', { ascending: false, nullsFirst: false })
  const today = nzToday(now)
  return ((data ?? []) as LeadRow[]).map((r) => stageOf(r, today))
}

// ── Sync ────────────────────────────────────────────────────────────────────

type Agg = {
  email: string
  name: string | null
  organisation: string | null
  temperature: 'warm' | 'cold' | 'pitched'
  lastSubject: string | null
  lastAt: number
  lastIn: number
  lastOut: number
  messagesIn: number
  messagesOut: number
}

function folderInfo(path: string): { temperature: 'warm' | 'cold'; organisation: string | null } | null {
  // "INBOX.02 Leads.Warm.House of Halo" → warm, "House of Halo". The server's
  // separator is "." here, but "/" is handled too.
  const parts = path.split(/[./]/)
  const i = parts.findIndex((p) => /^02 leads$/i.test(p.trim()))
  if (i < 0) return null
  const kind = parts[i + 1]?.toLowerCase()
  if (kind !== 'warm' && kind !== 'cold') return null
  const org = parts.slice(i + 2).join(' ').trim()
  return { temperature: kind, organisation: org || null }
}

export type LeadSyncResult = { ran: boolean; leads: number; error?: string }

export async function syncLeads(admin: Db, opts: { force?: boolean } = {}): Promise<LeadSyncResult> {
  if (!opts.force) {
    const { data } = await admin.from('kv_cache').select('updated_at').eq('key', LEADS_SYNCED_KEY).maybeSingle()
    if (data?.updated_at && Date.now() - Date.parse(data.updated_at) < SYNC_EVERY_MS) return { ran: false, leads: 0 }
  }

  const mail = await withClient(async (client: ImapFlow) => {
    const boxes = await client.list()
    const leadBoxes = boxes
      .map((b) => ({ path: b.path, info: folderInfo(b.path) }))
      .filter((b): b is { path: string; info: NonNullable<ReturnType<typeof folderInfo>> } => !!b.info)
    const filed: { info: NonNullable<ReturnType<typeof folderInfo>>; messages: EmailSummary[] }[] = []
    // One mailbox lock at a time on a connection, so these run in turn.
    for (const box of leadBoxes) {
      filed.push({ info: box.info, messages: await fetchMailboxEnvelopes(client, box.path, 400) })
    }
    const sent = await fetchMailboxEnvelopes(client, await resolveSentMailbox(client), 1500)
    return { filed, sent }
  })
  if (!mail) return { ran: false, leads: 0, error: 'Could not read the mailbox.' }

  const byEmail = new Map<string, Agg>()
  const touch = (email: string): Agg => {
    let a = byEmail.get(email)
    if (!a) {
      a = { email, name: null, organisation: null, temperature: 'pitched', lastSubject: null, lastAt: 0, lastIn: 0, lastOut: 0, messagesIn: 0, messagesOut: 0 }
      byEmail.set(email, a)
    }
    return a
  }

  for (const { info, messages } of mail.filed) {
    for (const m of messages) {
      const email = m.from.toLowerCase()
      if (!email.includes('@') || OWN_ADDRESS_RE.test(email) || m.bulk) continue
      const a = touch(email)
      const t = m.date ? Date.parse(m.date) : 0
      // Warm wins over cold when the same person is filed in both.
      if (a.temperature !== 'warm') a.temperature = info.temperature
      a.organisation = info.organisation ?? a.organisation
      a.name = m.fromName ?? a.name
      a.messagesIn++
      if (t > a.lastIn) a.lastIn = t
      if (t >= a.lastAt) { a.lastAt = t; a.lastSubject = m.subject }
    }
  }

  for (const m of mail.sent) {
    const t = m.date ? Date.parse(m.date) : 0
    const pitch = PITCH_RE.exec(m.subject ?? '')
    for (const to of m.to) {
      if (OWN_ADDRESS_RE.test(to)) continue
      // Sent mail counts for anyone already a lead, and starts a lead only
      // when it is one of the pitches.
      if (!byEmail.has(to) && !pitch) continue
      const a = touch(to)
      if (pitch && !a.organisation) a.organisation = pitch[2].trim()
      if (!a.name && m.toName && m.to[0] === to) a.name = m.toName
      a.messagesOut++
      if (t > a.lastOut) a.lastOut = t
      if (t >= a.lastAt) { a.lastAt = t; a.lastSubject = m.subject }
    }
  }

  const emails = [...byEmail.keys()]
  const { data: clients } = emails.length
    ? await admin.from('clients').select('id, email').in('email', emails)
    : { data: [] }
  const clientByEmail = new Map(((clients ?? []) as { id: string; email: string }[]).map((c) => [c.email.toLowerCase(), c.id]))

  const now = new Date().toISOString()
  const rows = [...byEmail.values()].map((a) => ({
    email: a.email,
    name: a.name,
    organisation: a.organisation,
    temperature: a.temperature,
    last_subject: a.lastSubject,
    last_in_at: a.lastIn ? new Date(a.lastIn).toISOString() : null,
    last_out_at: a.lastOut ? new Date(a.lastOut).toISOString() : null,
    messages_in: a.messagesIn,
    messages_out: a.messagesOut,
    client_id: clientByEmail.get(a.email) ?? null,
    updated_at: now,
  }))

  // Only the mail columns are in the payload, so an upsert leaves Arlo's own
  // fields (follow_up_on, status, note, nudge_draft) as they were.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from('leads').upsert(rows.slice(i, i + 200), { onConflict: 'email' })
    if (error) return { ran: true, leads: 0, error: error.message }
  }
  await admin.from('kv_cache').upsert({ key: LEADS_SYNCED_KEY, value: { leads: rows.length }, updated_at: now })
  return { ran: true, leads: rows.length }
}

// ── Nudge drafts ────────────────────────────────────────────────────────────

/** The last few emails each way with this address, as text, oldest first. */
async function threadWith(email: string): Promise<{ from: 'them' | 'arlo'; date: string; subject: string; text: string }[]> {
  const result = await withClient(async (client: ImapFlow) => {
    const boxes = (await client.list()).filter((b) => folderInfo(b.path)).map((b) => b.path)
    const sentBox = await resolveSentMailbox(client)
    const out: { from: 'them' | 'arlo'; date: string; subject: string; text: string }[] = []
    const read = async (box: string, query: Record<string, string>, from: 'them' | 'arlo') => {
      const lock = await client.getMailboxLock(box, { readOnly: true })
      try {
        const uids = ((await client.search(query, { uid: true })) || []) as number[]
        for (const uid of uids.slice(-2)) {
          const msg = await client.fetchOne(String(uid), { envelope: true, bodyStructure: true }, { uid: true })
          if (!msg) continue
          const part = pickTextPart(msg.bodyStructure as Parameters<typeof pickTextPart>[0])
          out.push({
            from,
            date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString().slice(0, 10) : '',
            subject: msg.envelope?.subject ?? '',
            text: part ? (await readPartText(client, uid, part)).slice(0, 1500) : '',
          })
        }
      } finally {
        lock.release()
      }
    }
    for (const box of boxes) await read(box, { from: email }, 'them')
    await read(sentBox, { to: email }, 'arlo')
    return out
  })
  return (result ?? []).sort((a, b) => a.date.localeCompare(b.date)).slice(-4)
}

const NUDGE_SYSTEM = `You write short follow-up emails for Arlo, who runs Tui Media, a creative content studio in Nelson, New Zealand that makes video content for local businesses. You are writing AS Arlo, to someone he has already emailed.

Voice: plain, casual and direct, like a local talking to a local. Short sentences. No em dashes, ever (use commas or full stops). Never say "storytelling". Say "video ads" or "videos", never "video marketing". No agency phrasing, no service lists, no "I hope this email finds you well", no "just circling back", no exclamation marks in a row. Never invent facts, results, prices, clients or dates. Never apologise for following up.

Write 2 to 4 sentences: refer to what was actually said last, give them one easy reason or question to reply to, and keep it light. If they wrote last, answer what they asked rather than nudging. Sign off "Cheers, Arlo". Output only the email body, no subject line.`

export async function draftNudge(admin: Db, leadId: string): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'No Anthropic key set.' }
  const { data: lead } = await admin.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'That lead is gone.' }
  const row = lead as LeadRow

  const thread = await threadWith(row.email)
  const context = [
    `Lead: ${row.organisation ?? ''} ${row.name ? `(${row.name})` : ''} <${row.email}>`,
    `Filed as: ${row.temperature}. Emails from them: ${row.messages_in}. Emails from Arlo: ${row.messages_out}.`,
    row.note ? `Arlo's note: ${row.note}` : null,
    '',
    thread.length
      ? thread.map((m) => `[${m.date}] ${m.from === 'arlo' ? 'Arlo' : 'Them'}: ${m.subject}\n${m.text || '(no text)'}`).join('\n\n')
      : `Last subject: ${row.last_subject ?? '(none)'}`,
  ].filter((l) => l !== null).join('\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const res = await anthropic.messages.create({
      // Haiku 5.5 thinks by default and the thinking draws on max_tokens, so
      // a tight ceiling cut drafts off mid-sentence. Low effort, as in the chat
      // route, with room to spare.
      model: 'claude-haiku-5-5',
      output_config: { effort: 'low' },
      max_tokens: 2048,
      system: NUDGE_SYSTEM,
      messages: [{ role: 'user', content: `${context}\n\nWrite the follow-up.` }],
    })
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
      // The voice rule is absolute, so enforce it rather than trust it.
      .replace(/\s*[—–]\s*/g, ', ')
    if (!text) return { ok: false, error: 'The draft came back empty.' }
    await admin.from('leads').update({ nudge_draft: text, nudge_drafted_at: new Date().toISOString() }).eq('id', leadId)
    return { ok: true, draft: text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Drafting failed.' }
  }
}

export function nudgeMailto(row: Pick<LeadRow, 'email' | 'last_subject'>, body: string): string {
  const subject = row.last_subject ? (/^re:/i.test(row.last_subject) ? row.last_subject : `Re: ${row.last_subject}`) : 'Following up'
  return `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
