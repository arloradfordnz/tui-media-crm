'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { setPortalPassword } from '@/app/actions/portal-auth'
import Field from '@/components/Field'

export default function SetPasswordForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState(setPortalPassword, undefined)

  // Once the token has been exchanged it is spent; the session it created is
  // what any retry runs on.
  const carryToken = token && !state?.verified

  return (
    <form action={action} className="space-y-5">
      {carryToken && <input type="hidden" name="token" value={token} />}

      <Field label="Password">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="field-input"
        />
      </Field>

      <Field label="Confirm password">
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Type it again"
          className="field-input"
        />
      </Field>

      {state?.error && (
        <div className="alert alert-danger">
          {/* One span so the link flows with the sentence; .alert is a flex row. */}
          <span>
            {state.error}
            {state.expired && (
              <>
                {' '}
                <Link href="/portal/forgot" className="underline">Get a fresh link</Link>
              </>
            )}
          </span>
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full mt-2">
        {pending ? 'Saving…' : 'Save and continue'}
      </button>
    </form>
  )
}
