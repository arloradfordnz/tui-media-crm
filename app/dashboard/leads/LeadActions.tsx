'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Clock, X, Mail, Check } from 'lucide-react'
import { draftLeadNudge, followUpLater, setLeadStatus, markNudged } from '@/app/actions/leads'

/** Draft, Later and Drop on a lead row. The draft opens in Mail as a reply,
 *  never sent from here: Arlo reads it first, and "Sent it" moves the row on
 *  without waiting for the next mailbox read. */
export default function LeadActions({
  id,
  email,
  subject,
  initialDraft,
  reply,
  dropped,
}: {
  id: string
  email: string
  subject: string | null
  initialDraft: string | null
  reply: boolean
  dropped?: boolean
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const hide = (e: React.MouseEvent<HTMLElement>) => {
    const row = e.currentTarget.closest<HTMLElement>('.lead-row')
    if (row) row.style.display = 'none'
    return row
  }
  const run = (e: React.MouseEvent<HTMLElement>, fn: () => Promise<{ ok: boolean }>) => {
    const row = hide(e)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok && row) row.style.display = ''
    })
  }

  if (dropped) {
    return (
      <div className="lead-actions">
        <button type="button" className="btn-ghost" disabled={pending} onClick={(e) => run(e, () => setLeadStatus(id, 'open'))}>
          Bring back
        </button>
      </div>
    )
  }

  const re = subject ? (/^re:/i.test(subject) ? subject : `Re: ${subject}`) : 'Following up'
  const mailto = draft
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(re)}&body=${encodeURIComponent(draft)}`
    : null

  return (
    <div className="lead-actions-wrap">
      <div className="lead-actions">
        <button
          type="button"
          className="btn-ghost btn-ghost-accent"
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const res = await draftLeadNudge(id)
              if (res.ok) setDraft(res.draft)
              else setError(res.error)
            })
          }}
        >
          <Sparkles className="w-4 h-4" />
          {pending && !draft ? 'Drafting…' : draft ? 'Redraft' : reply ? 'Draft reply' : 'Draft nudge'}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} title="Later: back in a week" onClick={(e) => run(e, () => followUpLater(id, 7))}>
          <Clock className="w-4 h-4" /> 1 wk
        </button>
        <button type="button" className="btn-ghost" disabled={pending} title="Later: back in a month" onClick={(e) => run(e, () => followUpLater(id, 30))}>
          1 mo
        </button>
        <button type="button" className="btn-ghost" disabled={pending} aria-label="Drop this lead" title="Drop this lead" onClick={(e) => run(e, () => setLeadStatus(id, 'dropped'))}>
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="lead-error">{error}</p>}
      {draft && mailto && (
        <div className="lead-draft">
          <p className="lead-draft-text">{draft}</p>
          <div className="lead-actions">
            <a href={mailto} className="btn-secondary">
              <Mail className="w-4 h-4" /> Open in Mail
            </a>
            <button type="button" className="btn-ghost" disabled={pending} onClick={(e) => run(e, () => markNudged(id))}>
              <Check className="w-4 h-4" /> Sent it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
