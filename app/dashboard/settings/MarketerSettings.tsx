'use client'

import { useActionState, useTransition } from 'react'
import { inviteMarketer, removeMarketer } from '@/app/actions/marketers'
import Field from '@/components/Field'

export type MarketerRow = { id: string; email: string; name: string; lastSignInAt: string | null }

export default function MarketerSettings({ marketers }: { marketers: MarketerRow[] }) {
  const [state, action, pending] = useActionState(inviteMarketer, undefined)
  const [removing, startRemove] = useTransition()

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Marketing login</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        A separate login for your marketer. They can watch and download approved videos, and see nothing else in the CRM.
        They sign in at the usual sign-in page.
      </p>

      {marketers.length > 0 && (
        <ul className="mb-5 space-y-2">
          {marketers.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
              <span style={{ color: 'var(--text-primary)' }}>
                {m.name ? `${m.name} · ` : ''}{m.email}
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {m.lastSignInAt ? ` · last in ${new Date(m.lastSignInAt).toLocaleDateString('en-NZ')}` : ' · hasn’t signed in yet'}
                </span>
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={removing}
                onClick={() => {
                  if (confirm(`Remove ${m.email}? They will no longer be able to sign in.`)) {
                    startRemove(async () => { await removeMarketer(m.id) })
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name">
            <input name="name" type="text" autoComplete="off" placeholder="Their name" className="field-input" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required autoComplete="off" placeholder="marketer@example.com" className="field-input" />
          </Field>
        </div>
        {state && !state.ok && <div className="alert alert-danger">{state.error}</div>}
        {state?.ok && <div className="alert alert-success">Setup link sent to {state.email}.</div>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Sending…' : marketers.length ? 'Add or re-send invite' : 'Send invite'}
        </button>
      </form>
    </div>
  )
}
