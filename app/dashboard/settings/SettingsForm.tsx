'use client'

import { useActionState } from 'react'
import { changePassword } from '@/app/actions/settings'
import { Lock } from 'lucide-react'

export default function SettingsForm() {
  const [state, action, pending] = useActionState(changePassword, undefined)

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> Change Password</span>
      </h2>
      <form action={action} className="space-y-4">
        <div>
          <label className="field-label">Current Password</label>
          <input name="currentPassword" type="password" required className="field-input" />
        </div>
        <div>
          <label className="field-label">New Password</label>
          <input name="newPassword" type="password" required minLength={8} className="field-input" />
        </div>
        <div>
          <label className="field-label">Confirm New Password</label>
          <input name="confirmPassword" type="password" required className="field-input" />
        </div>
        {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state?.success && <p className="text-sm" style={{ color: 'var(--success)' }}>Password updated successfully.</p>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}
