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
}

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

/** Most recent messages in the inbox, newest first. Envelope only — never marks as read. */
export async function fetchRecentEmails(limit = 15): Promise<EmailSummary[]> {
  const result = await withClient(async (client) => {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      const status = await client.status('INBOX', { messages: true })
      const total = status.messages ?? 0
      if (total === 0) return []

      const start = Math.max(1, total - limit + 1)
      const summaries: EmailSummary[] = []
      // Four headers, not the body. Still nothing that can mark a message
      // \\Seen — the mailbox is opened read-only above and headers are not a
      // body fetch.
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
        })
      }
      return summaries.reverse()
    } finally {
      lock.release()
    }
  })

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
// module reads envelopes only — subject, sender, date, flags — never bodies,
// so "needs a reply" is inferred from who sent it and whether it has been
// opened, not from what it says.
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
 * Unread mail from a human, oldest first — the order you would want to answer
 * them in, since the one that has been sitting longest is the one someone is
 * most likely wondering about.
 */
export async function fetchMailAwaitingReply(limit = 6): Promise<WaitingEmail[]> {
  const unread = await fetchUnreadEmails(40)
  const now = Date.now()

  return unread
    .filter((e) => {
      if (e.bulk) return false
      const from = e.from.toLowerCase()
      if (isSelf(from)) return false
      // A backstop for the few senders that skip the headers entirely.
      return !NEVER_A_REPLY.some((pattern) => from.includes(pattern))
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
