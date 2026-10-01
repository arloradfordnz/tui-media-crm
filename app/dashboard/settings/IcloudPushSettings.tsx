'use client'

import { useActionState } from 'react'
import { saveIcloudPush } from '@/app/actions/settings'
import { CalendarSync } from 'lucide-react'
import Field from '@/components/Field'
import CustomSelect from '@/components/CustomSelect'

type Status = { at: string; ok: boolean; error?: string; created?: number; updated?: number; removed?: number; remaining?: number }

export default function IcloudPushSettings({
  appleId, connected, calendars, calendarUrl, status,
}: {
  appleId: string
  connected: boolean
  calendars: { name: string; url: string }[]
  calendarUrl: string
  status: Status | null
}) {
  const [state, action, pending] = useActionState(saveIcloudPush, undefined)

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2"><CalendarSync className="w-4 h-4" /> Send CRM events to your phone</span>
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Writes shoots and anything you add in the CRM into your iPhone work calendar, so you only need that one calendar and can remove the &ldquo;Tui Media&rdquo; subscription. Needs an app-specific password: sign in at account.apple.com, open Sign-In and Security, then App-Specific Passwords, and make one called Tui CRM. It can only reach Calendar, and you can revoke it there any time.
      </p>
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Apple ID">
            <input name="appleId" type="email" defaultValue={appleId} className="field-input" placeholder="you@icloud.com" autoComplete="off" />
          </Field>
          <Field label="App-specific password" hint={connected ? 'Saved. Leave blank to keep it' : undefined}>
            <input name="appPassword" type="password" className="field-input" placeholder={connected ? '••••••••••••••••' : 'xxxx-xxxx-xxxx-xxxx'} autoComplete="new-password" />
          </Field>
        </div>
        {connected && calendars.length > 0 && (
          <Field label="Work calendar" hint="The calendar CRM events are written into">
            <CustomSelect
              name="calendarUrl"
              defaultValue={calendarUrl}
              placeholder="Select..."
              options={[{ value: '', label: 'Select...' }, ...calendars.map((c) => ({ value: c.url, label: c.name }))]}
            />
          </Field>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Working…' : connected ? 'Save' : 'Connect'}</button>
          {connected && (
            <button type="submit" name="intent" value="disconnect" disabled={pending} className="btn-ghost">Disconnect</button>
          )}
        </div>
      </form>
      {state && 'error' in state && state.error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {state && 'success' in state && state.success && <p className="text-sm mt-3" style={{ color: 'var(--success)' }}>{state.success}</p>}
      {status && (
        <p className="text-xs mt-3" style={{ color: status.ok ? 'var(--text-tertiary)' : 'var(--danger)' }}>
          {status.ok
            ? `Last sync ${new Date(status.at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: ${status.created ?? 0} added, ${status.updated ?? 0} updated, ${status.removed ?? 0} removed.`
            : `Last sync failed: ${status.error}`}
        </p>
      )}
    </div>
  )
}
