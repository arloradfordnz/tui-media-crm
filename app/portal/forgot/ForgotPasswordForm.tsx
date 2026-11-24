'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPortalPasswordReset } from '@/app/actions/portal-auth'
import Field from '@/components/Field'
import { brandIdentity, portalAuthHref } from '@/lib/brand'

export default function ForgotPasswordForm({ brand }: { brand: string | null }) {
  const [state, action, pending] = useActionState(requestPortalPasswordReset, undefined)
  const id = brandIdentity(brand)
  const loginHref = portalAuthHref('/portal/login', brand)

  if (state?.sent) {
    return (
      <div className="space-y-5">
        {/* Worded for both cases on purpose — see requestPortalPasswordReset. */}
        <div className="alert alert-success">
          If that email has {id.brand === 'tui_media' ? 'a' : 'an'} {id.displayName} portal account, a link to choose a new password is on its way. Check your junk folder if it hasn’t arrived in a few minutes.
        </div>
        <Link href={loginHref} className="btn-secondary w-full">Back to sign in</Link>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5">
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="field-input" />
      </Field>

      {state?.error && <div className="alert alert-danger">{state.error}</div>}

      <button type="submit" disabled={pending} className="btn-primary w-full mt-2">
        {pending ? 'Sending…' : 'Send reset link'}
      </button>

      <p className="text-center text-sm">
        <Link href={loginHref} className="link-subtle">Back to sign in</Link>
      </p>
    </form>
  )
}
