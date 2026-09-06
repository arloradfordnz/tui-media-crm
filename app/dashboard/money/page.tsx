import { Suspense } from 'react'
import Link from 'next/link'
import { Receipt, ArrowUpRight, Plug } from 'lucide-react'
import { fetchOutstandingInvoicesCached, getValidXeroAccount } from '@/lib/xero'
import { formatNZD, formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Money' }

// Who owes what, and how late.
//
// /dashboard/finance answers "how is the business doing" — revenue over time,
// invoice health as totals, averages. It could tell you three invoices were
// overdue for $3,363 and there was nowhere in the app to find out WHICH three.
// The home screen's attention list has the same problem: it can say money is
// owed, and its only honest action was to send you to Xero.
//
// This page is the operational half of money: a list
// you work down. Finance stays the analytical half.

function daysBetween(iso: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(iso)) / 86400000)
}

export default function MoneyPage() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Money</h1>
          <p className="page-subtitle">Invoices raised and not yet paid.</p>
        </div>
        <Link href="/dashboard/finance" className="btn-secondary btn-sm">
          Revenue and trends <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Xero is slow and occasionally down. It must never gate first paint —
          the same reason the home screen stopped blocking on it in Phase 2. */}
      <Suspense fallback={<InvoicesSkeleton />}>
        <Invoices />
      </Suspense>
    </div>
  )
}

function InvoicesSkeleton() {
  return (
    <div className="card-flush">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-4 py-4" style={{ borderBottom: '1px solid var(--bg-border)' }}>
          <div className="skeleton" style={{ height: 14, width: '38%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 12, width: '22%' }} />
        </div>
      ))}
    </div>
  )
}

async function Invoices() {
  const account = await getValidXeroAccount()
  if (!account) {
    return (
      <div className="empty-state card">
        <Plug className="w-10 h-10 empty-icon" />
        <p className="empty-title">Xero isn&apos;t connected</p>
        <p className="empty-description">Connect it and unpaid invoices show up here.</p>
        <a href="/api/auth/xero/start" className="btn-primary mt-4">Connect Xero</a>
      </div>
    )
  }

  const invoices = await fetchOutstandingInvoicesCached()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })

  // Only what is actually owed. A DRAFT invoice is a note to yourself, and a
  // fully-paid one that Xero has not closed out is not money outstanding.
  const owed = invoices.filter((inv) => inv.AmountDue > 0 && inv.Status !== 'DRAFT')

  const rows = owed
    .map((inv) => {
      const due = inv.DueDateString?.slice(0, 10) ?? null
      const daysLate = due ? daysBetween(due, today) : 0
      return { inv, due, daysLate, overdue: daysLate > 0 }
    })
    // Latest first: the list is a call order, not a ledger.
    .sort((a, b) => b.daysLate - a.daysLate)

  if (rows.length === 0) {
    return (
      <div className="empty-state card">
        <Receipt className="w-10 h-10 empty-icon" />
        <p className="empty-title">Nothing outstanding</p>
        <p className="empty-description">Every invoice you have raised has been paid.</p>
      </div>
    )
  }

  const overdue = rows.filter((r) => r.overdue)
  const overdueTotal = overdue.reduce((s, r) => s + r.inv.AmountDue, 0)
  const total = rows.reduce((s, r) => s + r.inv.AmountDue, 0)

  return (
    <>
      <div className="card">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <Figure label="Outstanding" value={formatNZD(total)} count={rows.length} />
          <Figure
            label="Overdue"
            value={formatNZD(overdueTotal)}
            count={overdue.length}
            danger={overdue.length > 0}
          />
        </div>
      </div>

      <div className="card-flush">
        <table className="w-full record-table">
          <thead>
            <tr>
              <th className="table-header text-left">Client</th>
              <th className="table-header text-left">Invoice</th>
              <th className="table-header text-left">Due</th>
              <th className="table-header text-right">Amount</th>
              <th className="table-header text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ inv, due, daysLate, overdue: isLate }) => (
              <tr key={inv.InvoiceID} className="table-row">
                <td className="px-4 py-4" data-role="primary">
                  {/* No cell-dupe subtitle here. The jobs list repeats the
                      client under the job name because retainer jobs all share
                      a month-based name; a client name is already distinct, so
                      repeating the invoice number under it would just print it
                      twice on desktop. */}
                  <span className="text-sm font-medium block" style={{ color: 'var(--text-primary)' }}>
                    {inv.Contact?.Name || 'Unknown contact'}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm" data-role="secondary" style={{ color: 'var(--text-secondary)' }}>
                  {inv.InvoiceNumber}
                </td>
                <td className="px-4 py-4 text-sm" data-role="secondary" style={{ color: 'var(--text-secondary)' }}>
                  {due ? formatDate(due) : <span className="cell-empty">—</span>}
                </td>
                <td className="px-4 py-4 text-sm text-right" data-role="secondary" style={{ color: 'var(--text-primary)' }}>
                  {formatNZD(inv.AmountDue)}
                </td>
                <td className="px-4 py-4 text-right" data-role="trailing">
                  {isLate ? (
                    <span className="badge badge-danger">
                      {daysLate} {daysLate === 1 ? 'day' : 'days'} late
                    </span>
                  ) : (
                    <span className="badge badge-muted">
                      {daysLate === 0 ? 'Due today' : `Due in ${-daysLate}d`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Read from Xero. Raising, editing and voiding still happen there, or by asking Tui.
      </p>
    </>
  )
}

function Figure({ label, value, count, danger }: { label: string; value: string; count: number; danger?: boolean }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="text-xl font-semibold" style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)' }}>
        {value}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {count} {count === 1 ? 'invoice' : 'invoices'}
      </p>
    </div>
  )
}
