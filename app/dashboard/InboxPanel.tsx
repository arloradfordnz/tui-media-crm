import { fetchMailAwaitingReply } from '@/lib/mail'
import { Mail } from 'lucide-react'

// Mail from hello@tuimedia.nz that looks like it is waiting on a reply.
//
// Streamed in behind Suspense rather than fetched with the page. An IMAP login
// takes a second or two and this dashboard was deliberately made to paint
// without waiting on anything remote — Xero was pulled off it for the same
// reason. The rest of the page is usable before this arrives.
//
// Read-only and envelope-only: opening one here does nothing to the mailbox,
// and nothing in this path can mark a message as seen behind you.
export default async function InboxPanel() {
  const waiting = await fetchMailAwaitingReply(5)

  if (waiting.length === 0) return null

  return (
    <section style={{ marginTop: 32 }}>
      <div className="flex items-center justify-between pb-1">
        <h2 className="section-heading" style={{ marginBottom: 0 }}>Waiting on a reply</h2>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>hello@tuimedia.nz</span>
      </div>

      <div className="card-flush">
        {waiting.map((m, i) => (
          <a
            key={`${m.from}-${m.date}-${i}`}
            href={`mailto:${m.from}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
            className="inbox-row"
          >
            <Mail className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <div className="inbox-body">
              <span className="inbox-subject">{m.subject}</span>
              <span className="inbox-meta">
                {m.from}
                {m.date && ` · ${m.ageDays === 0 ? 'today' : m.ageDays === 1 ? 'yesterday' : `${m.ageDays} days ago`}`}
              </span>
            </div>
            {/* Three days unanswered is the point where it stops being "I'll
                get to it" and starts being someone wondering if you got it. */}
            {m.ageDays >= 3 && (
              <span className="badge badge-danger badge-sm">{m.ageDays}d</span>
            )}
          </a>
        ))}
      </div>
    </section>
  )
}

export function InboxPanelSkeleton() {
  return (
    <section style={{ marginTop: 32 }}>
      <div className="pb-1"><div className="skeleton" style={{ width: 150, height: 13, borderRadius: 6 }} /></div>
      <div className="card-flush">
        {[0, 1].map((i) => (
          <div key={i} className="inbox-row" style={{ pointerEvents: 'none' }}>
            <div className="skeleton" style={{ width: 16, height: 16, borderRadius: 4, flex: 'none' }} />
            <div className="inbox-body" style={{ gap: 6 }}>
              <div className="skeleton" style={{ width: `${60 - i * 12}%`, height: 13, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: `${40 - i * 8}%`, height: 11, borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
