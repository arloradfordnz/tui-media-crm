'use client'

import { useActionState, useState } from 'react'
import { saveAdminIps } from '@/app/actions/settings'
import { EyeOff, Plus } from 'lucide-react'
import Field from '@/components/Field'

/**
 * Which viewers of a client portal are Arlo rather than a client.
 *
 * The signed-in case is handled automatically (see lib/admin-ip.ts), so this
 * only exists for the browser that ISN'T signed in — a private window, a
 * phone, a second browser used to preview the link.
 */
export default function PortalNotificationSettings({
  currentIps,
  requestIp,
}: {
  currentIps: string[]
  requestIp: string | null
}) {
  const [state, action, pending] = useActionState(saveAdminIps, undefined)
  const [value, setValue] = useState(currentIps.join(', '))

  const alreadyListed = !!requestIp && currentIps.includes(requestIp)

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2"><EyeOff className="w-4 h-4" /> Portal Notifications</span>
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Viewing, downloading and approving on a client portal emails you. While you&apos;re signed in
        here that&apos;s skipped automatically, so checking a client&apos;s link never notifies you.
        Add an IP address below to also skip it from a browser you aren&apos;t signed into.
      </p>

      <form action={action}>
        <Field
          label="Your IP addresses"
          hint="Comma separated. Leave blank to rely on the signed-in check alone."
        >
          <input
            name="adminIps"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="field-input"
            placeholder="e.g. 203.0.113.42"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? 'Saving…' : 'Save'}
          </button>
          {requestIp && !alreadyListed && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setValue((v) => (v.trim() ? `${v.replace(/,\s*$/, '')}, ${requestIp}` : requestIp))}
            >
              <Plus className="w-4 h-4" /> Add this device ({requestIp})
            </button>
          )}
          {requestIp && alreadyListed && (
            <span className="text-xs" style={{ color: 'var(--success)' }}>
              This device ({requestIp}) is already on the list.
            </span>
          )}
          {!requestIp && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Your IP isn&apos;t visible on this connection (usually only true in local dev).
            </span>
          )}
        </div>
      </form>

      {state?.error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {state && 'success' in state && state.success && (
        <p className="text-sm mt-3" style={{ color: 'var(--success)' }}>Saved.</p>
      )}
    </div>
  )
}
