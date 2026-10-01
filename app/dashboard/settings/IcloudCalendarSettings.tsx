'use client'

import { useActionState } from 'react'
import { saveIcloudCalendar } from '@/app/actions/settings'
import { Smartphone } from 'lucide-react'
import Field from '@/components/Field'

export default function IcloudCalendarSettings({ currentUrl }: { currentUrl: string }) {
  const [state, action, pending] = useActionState(saveIcloudCalendar, undefined)

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2"><Smartphone className="w-4 h-4" /> iPhone calendar</span>
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Events in your iPhone work calendar show up on the CRM calendar, Today and in Tui, updated every few minutes. It only reads: add and change events on the phone. On the iPhone, open Calendar, tap Calendars, press the info button beside your work calendar, switch on Public Calendar, then copy the link and paste it here. Anyone with the link can see that calendar, so use the work one. Clear the box and save to switch it off.
      </p>
      <form action={action} className="flex items-end gap-3">
        <Field label="Public calendar link" className="flex-1">
          <input
            name="icloudUrl"
            defaultValue={currentUrl}
            className="field-input"
            placeholder="webcal://p00-caldav.icloud.com/published/..."
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <button type="submit" disabled={pending} className="btn-primary mb-6">
          {pending ? 'Syncing…' : 'Save'}
        </button>
      </form>
      {state && 'error' in state && state.error && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {state && 'success' in state && state.success && <p className="text-sm mt-2" style={{ color: 'var(--success)' }}>{state.success}</p>}
    </div>
  )
}
