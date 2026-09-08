'use client'

import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { login } from '@/app/actions/auth'
import Image from 'next/image'
import Field from '@/components/Field'

// Why the dashboard sent you here, when it was not simply "you are signed out".
// 'stale' is the one case worth naming: the session was valid but its token
// predated the admin role, so the CRM would have rendered empty rather than
// refused. Saying so beats letting it look like the data went missing.
const REASONS: Record<string, string> = {
  stale: 'Your session was signed in before your permissions were updated, so it could no longer read the CRM. Signing in again fixes it. Nothing has been lost.',
}

function LoginNotice() {
  const reason = useSearchParams().get('reason')
  const message = reason ? REASONS[reason] : null
  if (!message) return null
  return <div className="alert alert-warning mb-6">{message}</div>
}

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined)

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm animate-fade-in">

        {/* Logo */}
        <div className="flex justify-center mb-12">
          <Image
            className="logo-light"
            src="/Primary_Black.svg"
            alt="Tui Media"
            width={180}
            height={37}
            priority
          />
          <Image
            className="logo-dark"
            src="/Primary_White.svg"
            alt="Tui Media"
            width={180}
            height={37}
            priority
          />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Sign in
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          Enter your details to access the dashboard.
        </p>

        {/* useSearchParams needs a Suspense boundary or the whole route opts
            out of static rendering. */}
        <Suspense fallback={null}>
          <LoginNotice />
        </Suspense>

        {/* Form */}
        <form action={action} className="space-y-5">
          <Field label="Email">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="field-input"
            />
          </Field>

          <Field label="Password">
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="field-input"
            />
          </Field>

          {state?.error && (
            <div className="alert alert-danger">
              {state.error}
            </div>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full mt-2">
            {pending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs mt-12" style={{ color: 'var(--text-tertiary)' }}>
          &copy; {new Date().getFullYear()} Tui Media
        </p>
      </div>
    </div>
  )
}
