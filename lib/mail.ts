import { ImapFlow } from 'imapflow'

// Read-only IMAP access to hello@tuimedia.nz. Deliberately fetches envelope
// data only (subject/from/date/flags) — never the message body — so nothing
// here can ever mark a message \Seen behind Arlo's back. He reads his own
// mail in Apple Mail; this just gives the assistant awareness of it.

// The headers that mean "this was sent to a list, not to you".
//
// List-Unsubscribe is the strong one: every bulk sender sets it, because Gmail
// and Yahoo require it of anyone sending at volume. Precedence: bulk and
// Auto-Submitted cover the older and the machine-generated cases.
//
// This replaced a denylist of sender domains, which is a game you cannot win —
// it was already letting posts-recaps@mail.instagram.com through, and the next
// one would have been some address nobody had thought of.
const BULK_HEADERS = ['list-unsubscribe', 'list-id', 'precedence', 'auto-submitted']

export type EmailSummary = {
  subject: string
  from: string
  date: string | null
  unread: boolean
  flagged: boolean
  /** True when the message carries a header only bulk senders set. See BULK_HEADERS. */
  bulk: boolean
  /** Recipients (to + cc), lowercased. Only used to cross-reference the sent
   *  folder in fetchMailAwaitingReply — irrelevant for an inbox message. */
  to: string[]
}

/** Where sent mail actually lives on this account — see the folder probe run
 *  6 September 2026 (`imapflow`'s `list()`): a manually-organised mailbox with
 *  its own naming, not one of the auto-detected \\Sent special-use folders. */
const SENT_MAILBOX = 'INBOX.Sent Messages'

async function withClient<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T | null> {
  const host = process.env.EMAIL_IMAP_HOST
  const port = process.env.EMAIL_IMAP_PORT
  const user = process.env.EMAIL_IMAP_USER
  const password = process.env.EMAIL_IMAP_PASSWORD
  if (!host || !port || !user || !password) {
    console.error('[mail] Missing EMAIL_IMAP_HOST / EMAIL_IMAP_PORT / EMAIL_IMAP_USER / EMAIL_IMAP_PASSWORD')
    return null
  }

  const client = new ImapFlow({
    host,
    port: Number(port),
    secure: true,
    auth: { user, pass: password },
    logger: false,
  })

  try {
    await client.connect()
    return await fn(client)
  } catch (err) {
    console.error('[mail] IMAP error:', err)
    return null
  } finally {
    await client.logout().catch(() => client.close())
  }
}

/** Envelope + flags for the most recent `limit` messages in one mailbox,
 *  newest first. The shared body behind fetchRecentEmails and the sent-folder
 *  read fetchMailAwaitingReply does — same four headers, same guarantee that
 *  nothing here can mark a message \\Seen, because the lock is read-only and
 *  headers are not a body fetch. */
async function fetchMailboxEnvelopes(client: ImapFlow, mailbox: string, limit: number): Promise<EmailSummary[]> {
  const lock = await client.getMailboxLock(mailbox, { readOnly: true })
  try {
    const status = await client.status(mailbox, { messages: true })
    const total = status.messages ?? 0
    if (total === 0) return []

    const start = Math.max(1, total - limit + 1)
    const summaries: EmailSummary[] = []
    for await (const msg of client.fetch(`${start}:${total}`, {
      envelope: true,
      flags: true,
      headers: BULK_HEADERS,
    })) {
      const raw = msg.headers?.toString('utf8').toLowerCase() ?? ''
      summaries.push({
        subject: msg.envelope?.subject ?? '(no subject)',
        from: msg.envelope?.from?.[0]?.address ?? msg.envelope?.from?.[0]?.name ?? 'unknown',
        date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
        unread: !msg.flags?.has('\\Seen'),
        flagged: !!msg.flags?.has('\\Flagged'),
        bulk: BULK_HEADERS.some((h) => raw.includes(`${h}:`)),
        to: [...(msg.envelope?.to ?? []), ...(msg.envelope?.cc ?? [])]
          .map((a) => a.address?.toLowerCase())
          .filter((a): a is string => !!a),
      })
    }
    return summaries.reverse()
  } finally {
    lock.release()
  }
}

/** Most recent messages in the inbox, newest first. Envelope only — never marks as read. */
export async function fetchRecentEmails(limit = 15): Promise<EmailSummary[]> {
  const result = await withClient((client) => fetchMailboxEnvelopes(client, 'INBOX', limit))
  return result ?? []
}

/** Unread messages only — the subset most likely to need a look. */
export async function fetchUnreadEmails(limit = 15): Promise<EmailSummary[]> {
  const all = await fetchRecentEmails(Math.max(limit, 30))
  return all.filter((e) => e.unread).slice(0, limit)
}

// ── Mail that is probably waiting on you ────────────────────────────────────
//
// A heuristic, and worth being honest about what it can and cannot see. This
// module reads envelopes only — subject, sender, date, flags, recipients —
// never bodies, so "needs a reply" is inferred from who sent it, who it was
// sent to, and whether a later message answered it, not from what it says.
//
// This used to be "unread, from a human" — which meant reading a message
// without replying, closing the laptop, and coming back a week later found it
// gone from the list, because "unread" is a click, not an answer. A message
// read at 11pm and never actioned is exactly the case worth surfacing, and it
// looked identical to one that had genuinely been dealt with. The real
// question is whether anything was SENT back, so this now cross-references
// the sent folder: a message counts as answered only once a later message went
// to that same address, regardless of its own read state.
//
// What it filters out is the traffic that is never a conversation, using the
// headers bulk senders are obliged to set rather than a list of domains.
// Anything from a real person stays in, because a false positive costs you a
// glance and a false negative costs you a client waiting.

const NEVER_A_REPLY = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'notifications@', 'notification@', 'alerts@', 'alert@',
]

/** Our own address, so a copy of something Arlo sent is not "waiting on him". */
function isSelf(address: string): boolean {
  const me = (process.env.EMAIL_IMAP_USER ?? '').toLowerCase()
  return !!me && address.toLowerCase().includes(me)
}

export type WaitingEmail = EmailSummary & { ageDays: number }

/**
 * Mail from a human that nothing has been sent back to since, oldest first —
 * the order you would want to answer them in, since the one that has been
 * sitting longest is the one someone is most likely wondering about.
 *
 * A message is flagged (starred in Apple Mail) surfaces unconditionally,
 * bulk/self/never-a-reply included — flagging something is Arlo saying "I
 * need to come back to this" with his own hand, which outranks any heuristic
 * here.
 */
export async function fetchMailAwaitingReply(limit = 6): Promise<WaitingEmail[]> {
  const result = await withClient(async (client) => {
    const inbox = await fetchMailboxEnvelopes(client, 'INBOX', 60)
    // How far back the sent folder needs to reach depends on the inbox
    // messages it has to cross-reference. Same window as the inbox read is
    // the simplest correct bound: nothing older than the oldest inbox
    // candidate needs an answer to be checked against.
    const sent = await fetchMailboxEnvelopes(client, SENT_MAILBOX, 150).catch(() => [] as EmailSummary[])
    return { inbox, sent }
  })
  if (!result) return []

  // Latest time anything was sent TO each address, so "answered after this
  // one arrived" is a single lookup rather than a scan per candidate.
  const lastReplyTo = new Map<string, number>()
  for (const s of result.sent) {
    if (!s.date) continue
    const sentAt = Date.parse(s.date)
    for (const addr of s.to) {
      const prev = lastReplyTo.get(addr)
      if (prev === undefined || prev < sentAt) lastReplyTo.set(addr, sentAt)
    }
  }

  const now = Date.now()

  return result.inbox
    .filter((e) => {
      const from = e.from.toLowerCase()
      if (isSelf(from)) return false
      if (e.flagged) return true
      if (e.bulk) return false
      // A backstop for the few senders that skip the headers entirely.
      if (NEVER_A_REPLY.some((pattern) => from.includes(pattern))) return false
      if (!e.date) return true // no date to compare — err toward showing it
      const repliedAt = lastReplyTo.get(from)
      return repliedAt === undefined || repliedAt < Date.parse(e.date)
    })
    .map((e) => ({
      ...e,
      ageDays: e.date ? Math.floor((now - Date.parse(e.date)) / 86400000) : 0,
    }))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, limit)
}

/** True only if login actually succeeds — used by the daily heartbeat to report real connectivity, not just "no results". */
export async function checkMailConnection(): Promise<boolean> {
  const result = await withClient(async () => true)
  return result === true
}
