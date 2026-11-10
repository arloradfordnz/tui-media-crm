// What this month is likely to bring in, as three stacked amounts.
//
//   received  money already in this month (Xero cash-basis P&L income)
//   invoiced  approved invoices not yet paid, due by the end of the month
//             (overdue ones included: they are still owed)
//   expected  work not invoiced yet that should land this month: booked jobs
//             with an expected payment date (or failing that, a shoot date)
//             in this month, plus active retainers if the monthly retainer
//             invoices have not gone out yet
//
// There is no hard link between a job and its Xero invoice, so double counting
// is avoided by matching instead. A job is left out once an outstanding
// invoice for the same client and amount exists, and retainers count only
// before the retainer invoice day (after it, they are in invoiced or received).
// It is a forecast, not a ledger: the point is a number worth glancing at.

import type { XeroCreatedInvoice } from './xero'

export type MonthForecast = {
  monthLabel: string
  received: number
  invoiced: number
  expected: number
  total: number
}

type JobRow = {
  status: string
  quote_value: number | null
  expected_amount: number | null
  expected_payment_date: string | null
  shoot_date: string | null
  paid_at: string | null
  clients: { name: string } | null
}

type RetainerRow = {
  monthly_retainer: number | null
  retainer_paused_from: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function buildMonthForecast({
  todayISO,
  receivedThisMonth,
  outstanding,
  jobs,
  retainers,
  retainerInvoiceDay,
}: {
  /** YYYY-MM-DD, NZ. */
  todayISO: string
  receivedThisMonth: number
  outstanding: XeroCreatedInvoice[]
  jobs: JobRow[]
  retainers: RetainerRow[]
  retainerInvoiceDay: number
}): MonthForecast {
  const month = todayISO.slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const monthEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-NZ', { timeZone: 'UTC', month: 'long' })

  const owed = outstanding.filter(
    (inv) => inv.Status !== 'DRAFT' && (inv.AmountDue ?? 0) > 0 && (inv.DueDateString ?? '').slice(0, 10) <= monthEnd
  )
  const invoiced = owed.reduce((sum, inv) => sum + inv.AmountDue, 0)

  // Any outstanding invoice, draft or not, whatever its due date: a job with
  // one has been billed, so it is not "still to invoice".
  const billed = new Set(outstanding.map((inv) => `${norm(inv.Contact?.Name)}|${Math.round(inv.Total)}`))

  let expected = 0
  for (const j of jobs) {
    if (j.paid_at || j.status === 'enquiry' || j.status === 'archived') continue
    const when = (j.expected_payment_date ?? j.shoot_date ?? '').slice(0, 7)
    if (when !== month) continue
    const amount = Number(j.expected_amount ?? j.quote_value ?? 0)
    if (amount <= 0) continue
    if (billed.has(`${norm(j.clients?.name)}|${Math.round(amount)}`)) continue
    expected += amount
  }

  const today = Number(todayISO.slice(8, 10))
  if (today < retainerInvoiceDay) {
    for (const r of retainers) {
      const paused = r.retainer_paused_from && r.retainer_paused_from.slice(0, 7) <= month
      if (!paused) expected += Number(r.monthly_retainer ?? 0)
    }
  }

  const received = Math.max(0, receivedThisMonth)
  return {
    monthLabel,
    received,
    invoiced,
    expected,
    total: received + invoiced + expected,
  }
}
