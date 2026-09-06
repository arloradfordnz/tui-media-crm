'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import Field from '@/components/Field'

export default function SetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Those two passwords don’t match.')

    setPending(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      setPending(false)
      return
    }
    // Full reload so the server components pick up the session cookie.
    router.push('/portal/me')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Password">
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="field-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Field label="Confirm password">
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="Type it again"
          className="field-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      {error && <div className="alert alert-danger">{error}</div>}

      <button type="submit" disabled={pending} className="btn-primary w-full mt-2">
        {pending ? 'Saving…' : 'Save and continue'}
      </button>
    </form>
  )
}
