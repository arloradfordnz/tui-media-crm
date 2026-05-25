'use client'

import { useActionState } from 'react'
import { saveRetainerInvoiceDay } from '@/app/actions/settings'
import { CalendarDays } from 'lucide-react'

export default function RetainerInvoiceSettings({ currentDay }: { currentDay: number }) {
  const [state, action, pending] = useActionState(saveRetainerInvoiceDay, undefined)

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Retainer Invoicing</span>
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Set the day of the month when retainer invoices should be created. You&apos;ll see a reminder on the Finance page when that day arrives.
      </p>
      <form action={action} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="field-label">Invoice day of month</label>
          <input
            name="retainerInvoiceDay"
            type="number"
            min="1"
            max="28"
            defaultValue={currentDay}
            className="field-input"
            placeholder="1–28"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Day 1–28 (use 28 to avoid month-end issues)
          </p>
        </div>
        <button type="submit" disabled={pending} className="btn-primary mb-6">
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {state?.error && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {state?.success && <p className="text-sm mt-2" style={{ color: 'var(--success)' }}>Saved.</p>}
    </div>
  )
}
