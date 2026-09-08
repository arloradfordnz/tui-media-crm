import { fetchMailAwaitingReply } from '@/lib/mail'
import { CheckCircle2, Mail } from 'lucide-react'

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

  // An empty result used to `return null`, which meant the skeleton drew for a
  // second or two and then the whole section vanished, leaving a gap where
  // something had visibly been loading. That reads as a failure, and it is the
  // most common outcome — an inbox with nothing awaiting a reply is the normal
  // state, not an error. Say so instead of disappearing.
  return (
    <section style={{ marginTop: 32 }}>
      <div className="section-head">
        <h2 className="section-heading">Waiting on a reply</h2>
        <span className="section-head-meta">hello@tuimedia.nz</span>
      </div>

      {waiting.length === 0 ? (
        <div className="today-empty">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing in the inbox is waiting on you.
          </p>
        </div>
      ) : (
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
      )}
    </section>
  )
}

// Shaped like the real thing, including its heading, so the section does not
// change size or position when the mail arrives.
export function InboxPanelSkeleton() {
  return (
    <section style={{ marginTop: 32 }}>
      <div className="section-head">
        <h2 className="section-heading">Waiting on a reply</h2>
        <span className="section-head-meta">hello@tuimedia.nz</span>
      </div>
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
