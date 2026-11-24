'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Pencil, Check } from 'lucide-react'
import { makeShotList, saveShotList } from '@/app/actions/shoots'

/** The shot list: written by Claude from the brief on request, saved on the
 *  shoot, and editable by hand. */
export default function ShotList({ eventId, initial }: { eventId: string; initial: string | null }) {
  const [text, setText] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const write = () => {
    setError(null)
    startTransition(async () => {
      const res = await makeShotList(eventId)
      if (res.ok) { setText(res.shotList); setDraft(res.shotList) } else setError(res.error)
    })
  }

  return (
    <section className="card shoot-card">
      <div className="section-head">
        <h2 className="section-heading">Shot list</h2>
        <div className="lead-actions">
          {text && !editing && (
            <button type="button" className="btn-ghost" onClick={() => { setDraft(text); setEditing(true) }}>
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
          {!editing && (
            <button type="button" className="btn-ghost btn-ghost-accent" disabled={pending} onClick={write}>
              <Sparkles className="w-4 h-4" /> {pending ? 'Writing…' : text ? 'Rewrite' : 'Write shot list'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="lead-error">{error}</p>}
      {editing ? (
        <div className="dash-stack">
          <textarea className="field-input shoot-shotlist-edit" rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="lead-actions">
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await saveShotList(eventId, draft)
                if (res.ok) { setText(draft.trim() || null); setEditing(false) } else setError('Could not save it.')
              })}
            >
              <Check className="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      ) : text ? (
        <p className="shoot-shotlist">{text}</p>
      ) : (
        <p className="lead-sub">Nothing yet. It is written from the job, its deliverables, the client notes and their recent emails.</p>
      )}
    </section>
  )
}
