'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/auth'
import Image from 'next/image'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined)

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm animate-fade-in">

        {/* Logo */}
        <div className="flex justify-center mb-12">
          <Image
            src="/Primary_White.svg"
            alt="Tui Media"
            width={180}
            height={38}
            priority
            style={{ height: 'auto' }}
          />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Sign in
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          Enter your details to access the dashboard.
        </p>

        {/* Form */}
        <form action={action} className="space-y-5">
          <div>
            <label htmlFor="email" className="field-label">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="field-input"
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="field-input"
            />
          </div>

          {state?.error && (
            <div className="text-sm px-4 py-3 rounded-lg" style={{ background: 'rgba(248, 113, 113, 0.1)', color: 'var(--danger)', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
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
