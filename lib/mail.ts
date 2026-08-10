import { ImapFlow } from 'imapflow'

// Read-only IMAP access to hello@tuimedia.nz. Deliberately fetches envelope
// data only (subject/from/date/flags) — never the message body — so nothing
// here can ever mark a message \Seen behind Arlo's back. He reads his own
// mail in Apple Mail; this just gives the assistant awareness of it.

export type EmailSummary = {
  subject: string
  from: string
  date: string | null
  unread: boolean
  flagged: boolean
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
      for await (const msg of client.fetch(`${start}:${total}`, { envelope: true, flags: true })) {
        summaries.push({
          subject: msg.envelope?.subject ?? '(no subject)',
          from: msg.envelope?.from?.[0]?.address ?? msg.envelope?.from?.[0]?.name ?? 'unknown',
          date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          unread: !msg.flags?.has('\\Seen'),
          flagged: !!msg.flags?.has('\\Flagged'),
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
