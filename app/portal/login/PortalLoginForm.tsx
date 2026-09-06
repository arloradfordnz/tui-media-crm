'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import Field from '@/components/Field'

export default function PortalLoginForm({ notice }: { notice: string | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(e.currentTarget)
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    })

    if (err) {
      // Deliberately not "no account with that email" — that would turn this
      // form into a way to find out who Tui Media's clients are.
      setError('That email and password don’t match.')
      setPending(false)
      return
    }

    router.push('/portal/me')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {notice && <div className="alert alert-warning">{notice}</div>}

      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="field-input" />
      </Field>

      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" className="field-input" />
      </Field>

      {error && <div className="alert alert-danger">{error}</div>}

      <button type="submit" disabled={pending} className="btn-primary w-full mt-2">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
