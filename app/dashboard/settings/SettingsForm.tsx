'use client'

import { useActionState, useState } from 'react'
import { changePassword } from '@/app/actions/settings'
import { Lock } from 'lucide-react'
import Field from '@/components/Field'
import PasswordStrength from '@/components/PasswordStrength'

export default function SettingsForm({ email }: { email?: string | null }) {
  const [state, action, pending] = useActionState(changePassword, undefined)
  const [next, setNext] = useState('')

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> Change Password</span>
      </h2>
      <form action={action} className="space-y-4">
        <Field label="Current Password">
          <input name="currentPassword" type="password" required className="field-input" />
      </Field>
        <Field label="New Password">
          <input name="newPassword" type="password" required minLength={10} autoComplete="new-password" className="field-input" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
        <PasswordStrength value={next} personal={[email]} />
        <Field label="Confirm New Password">
          <input name="confirmPassword" type="password" required className="field-input" />
      </Field>
        {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state?.success && <p className="text-sm" style={{ color: 'var(--success)' }}>Password updated successfully.</p>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}
