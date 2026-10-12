'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { setPortalPassword } from '@/app/actions/portal-auth'
import Field from '@/components/Field'
import PasswordStrength from '@/components/PasswordStrength'

export default function SetPasswordForm({ token, email }: { token?: string; email?: string | null }) {
  const [state, action, pending] = useActionState(setPortalPassword, undefined)
  const [password, setPassword] = useState('')

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
          minLength={10}
          autoComplete="new-password"
          placeholder="At least 10 characters"
          className="field-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <PasswordStrength value={password} personal={[email]} />

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
