'use client'

import { useActionState } from 'react'
import { saveRetainerInvoiceDay } from '@/app/actions/settings'
import { CalendarDays } from 'lucide-react'
import Field from '@/components/Field'

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
        <Field
          label="Invoice day of month"
          className="flex-1"
          hint="Day 1–28 (use 28 to avoid month-end issues)"
        >
          <input
            name="retainerInvoiceDay"
            type="number"
            min="1"
            max="28"
            defaultValue={currentDay}
            className="field-input"
          />
        </Field>
        <button type="submit" disabled={pending} className="btn-primary mb-6">
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {state?.error && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {/* The action returns a union — one arm has `success`, the other only
          `error` — so this needs an `in` check rather than a property read. */}
      {state && 'success' in state && state.success && (
        <p className="text-sm mt-2" style={{ color: 'var(--success)' }}>Saved.</p>
      )}
    </div>
  )
}
