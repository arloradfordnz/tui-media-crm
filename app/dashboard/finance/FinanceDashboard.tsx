'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import MoneyChart from './MoneyChart'
import type { XeroSummary, XeroTransaction, MonthlyPnl } from '@/lib/xero'

// ─── Types & helpers ──────────────────────────────────────────────────────────

type MonthsWindow = 3 | 6 | 12

const fmtShort = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

const fmtBig = (n: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n)

// ─── Figures ──────────────────────────────────────────────────────────────────

// Renders the whole comparison phrase rather than just the percentage, so the
// no-data case reads as a sentence instead of leaving a dangling preposition
// behind ("nothing to compare against against last year").
function Delta({ now, before, against, goodWhenUp = true }: { now: number; before: number; against: string; goodWhenUp?: boolean }) {
  if (before === 0) {
    return <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No {against} figure to compare against</span>
  }
  const pct = Math.round(((now - before) / Math.abs(before)) * 100)
  const good = (pct > 0) === goodWhenUp
  return (
    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
      <span style={{ color: pct === 0 ? 'var(--text-tertiary)' : good ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
        {pct > 0 ? '↑' : pct < 0 ? '↓' : ''}{Math.abs(pct)}%
      </span>{' '}
      against {against}
    </span>
  )
}

// ─── Cash & runway ────────────────────────────────────────────────────────────

// The old Cash Position card drew cash-in-bank, outstanding and overdue as one
// stacked bar, as though they were parts of a whole. They are not: the first is
// an asset you have and the other two are money you are owed, so the bar's total
// meant nothing. Runway is the question that cash actually answers.
function CashAndRunway({ balance, burn, runway }: { balance: number | null; burn: number; runway: number | null }) {
  if (balance == null) {
    return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No bank account connected in Xero.</p>
  }

  const tone = runway == null ? 'var(--text-primary)' : runway < 3 ? 'var(--danger)' : runway < 6 ? 'var(--warning)' : 'var(--success)'
  // Twelve months is "comfortable" — the meter is a ratio against that, capped.
  const pct = runway == null ? 0 : Math.min(100, (runway / 12) * 100)

  return (
    <div>
      <p style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
        {fmtBig(balance)}
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 14px' }}>
        {burn > 0 && runway != null ? (
          <>
            At {fmtBig(Math.round(burn))} a month of spending, that is{' '}
            <span style={{ color: tone, fontWeight: 600 }}>{runway} month{runway === 1 ? '' : 's'}</span> of runway.
          </>
        ) : (
          'Not enough spending history yet to work out runway.'
        )}
      </p>
      {runway != null && (
        <div
          role="meter"
          aria-valuenow={runway}
          aria-valuemin={0}
          aria-valuemax={12}
          aria-label="Months of runway, against twelve"
          style={{ height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 999 }} />
        </div>
      )}
    </div>
  )
}

// ─── Top clients ──────────────────────────────────────────────────────────────

// Nominal categories, so every bar takes the same hue. Colouring them by value
// would spend the identity channel re-encoding what bar length already shows.
function TopClients({ clients }: { clients: { name: string; total: number }[] }) {
  if (clients.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No paid invoices in this period.</p>
  }
  const max = Math.max(...clients.map((c) => c.total))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {clients.map((c) => (
        <div key={c.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5 }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {fmtBig(c.total)}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elevated)' }}>
            <div style={{ width: `${(c.total / max) * 100}%`, height: '100%', borderRadius: 4, background: 'var(--chart-in)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function fmtTxDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const TX_PAGE = 15

function TxTable({ txs }: { txs: XeroTransaction[] }) {
  const [visible, setVisible] = useState(TX_PAGE)
  // PAID only, matching every figure above. These totals used to count every
  // status, so the header said one thing and the hero said another about the
  // same period — the fastest way to make a reader distrust the whole page.
  const totalIn = txs.filter((t) => t.type === 'in' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const totalOut = txs.filter((t) => t.type === 'out' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const shown = txs.slice(0, visible)

  return (
    <div className="card" style={{ padding: '18px 20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', fontWeight: 500 }}>
            Transactions
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>({txs.length})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--success)' }}>+{fmtShort(totalIn)}</span>
          <span style={{ fontSize: 11, color: 'var(--danger)' }}>−{fmtShort(totalOut)}</span>
        </div>
      </div>
      {txs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>No transactions in this period.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--bg-border)' }}>
                  {['Date', 'Description', 'Ref', 'Status', 'Amount'].map((h) => (
                    <th key={h} style={{
                      padding: '5px 10px', textAlign: h === 'Amount' ? 'right' : 'left',
                      color: 'var(--text-tertiary)', fontWeight: 500,
                      textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((tx, i) => (
                  <tr key={tx.id + i} style={{ borderBottom: '1px solid var(--bg-border)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtTxDate(tx.date)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-primary)', maxWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tx.type === 'in'
                          ? <ArrowDownLeft style={{ width: 12, height: 12, color: 'var(--success)', flexShrink: 0 }} />
                          : <ArrowUpRight style={{ width: 12, height: 12, color: 'var(--danger)', flexShrink: 0 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-tertiary)', fontSize: 11 }}>{tx.reference ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: tx.status === 'PAID' ? 'color-mix(in srgb, var(--success) 15%, transparent)' : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        color: tx.status === 'PAID' ? 'var(--success)' : 'var(--accent)',
                      }}>{tx.status.toLowerCase()}</span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                      color: tx.type === 'in' ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                      {tx.type === 'in' ? '+' : '−'}{fmtShort(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible < txs.length && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => setVisible((v) => v + TX_PAGE)}
              >
                Load {Math.min(TX_PAGE, txs.length - visible)} more ({txs.length - visible} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function FinanceDashboard({
  summary,
  transactions,
  monthly,
  retainerInvoiceDay,
}: {
  summary: XeroSummary
  transactions: XeroTransaction[]
  monthly: MonthlyPnl[]
  retainerInvoiceDay?: number
}) {
  const [months, setMonths] = useState<MonthsWindow>(6)

  // Money in and money out come from Xero's own cash-basis P&L now, not from
  // adding up bank lines. See fetchMonthlyPnl for what that was getting wrong:
  // it reported five times the real spending, because every transfer, drawing
  // and personal card swipe leaving the account counted as an expense.
  const shown = useMemo(() => monthly.slice(-months), [monthly, months])
  const prior = useMemo(
    () => monthly.slice(Math.max(0, monthly.length - months * 2), Math.max(0, monthly.length - months)),
    [monthly, months],
  )

  const sum = (rows: MonthlyPnl[], key: 'income' | 'expenses') =>
    rows.reduce((t, r) => t + r[key], 0)

  const current = {
    inc: sum(shown, 'income'),
    out: sum(shown, 'expenses'),
    net: sum(shown, 'income') - sum(shown, 'expenses'),
  }
  const previous = {
    inc: sum(prior, 'income'),
    out: sum(prior, 'expenses'),
    net: sum(prior, 'income') - sum(prior, 'expenses'),
  }

  const inPoints = shown.map((m) => ({ label: m.label, value: m.income }))
  const outPoints = shown.map((m) => ({ label: m.label, value: m.expenses }))

  const rangeLabel = shown.length > 0
    ? `${shown[0].label} to ${shown[shown.length - 1].label}`
    : 'no data'

  // The transactions table still lists real transactions, so it keeps its own
  // window over the raw list.
  const windowStart = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - (months - 1), 1)
    return d.toISOString().slice(0, 10)
  }, [months])
  const filtered = useMemo(
    () => transactions.filter((t) => t.date >= windowStart),
    [transactions, windowStart],
  )

  const topClients = useMemo(() => {
    const totals = new Map<string, number>()
    for (const t of filtered) {
      if (t.type !== 'in' || t.status !== 'PAID') continue
      totals.set(t.description, (totals.get(t.description) ?? 0) + t.amount)
    }
    return [...totals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [filtered])

  // Burn over whole past months only — the current month is partial, and
  // including it drags the average down and flatters runway.
  const avgMonthlyBurn = useMemo(() => {
    const past = monthly.slice(0, -1).slice(-6).filter((m) => m.expenses > 0)
    return past.length > 0 ? past.reduce((t, m) => t + m.expenses, 0) / past.length : 0
  }, [monthly])

  const runwayMonths = summary.bank_balance_nzd != null && avgMonthlyBurn > 0
    ? Math.floor(summary.bank_balance_nzd / avgMonthlyBurn)
    : null

  const todayDay = new Date().getDate()
  const showRetainerReminder = retainerInvoiceDay != null && todayDay === retainerInvoiceDay

  const losing = current.net < 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {showRetainerReminder && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid var(--accent)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
            Today is retainer invoice day — time to send retainer invoices from Xero.
          </p>
        </div>
      )}

      <div>
        <h1 className="page-title">Finance</h1>
        <p className="page-subtitle">
          Live from {summary.org_name ?? 'Xero'}. For who owes what, see{' '}
          <Link href="/dashboard/money" style={{ color: 'var(--accent)' }}>Money</Link>.
        </p>
      </div>

      <section>
        <p className="label" style={{ marginBottom: 6 }}>
          {losing ? 'Net loss' : 'Net profit'} · last {months} months
        </p>
        <p className="finance-hero" style={{ color: losing ? 'var(--danger)' : 'var(--text-primary)' }}>
          {fmtBig(Math.round(current.net))}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '10px 0 0' }}>
          <Delta now={current.net} before={previous.net} against={`the ${months} months before`} />
          {losing && ' · you are spending more than you are bringing in'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
          Cash basis, straight from Xero&apos;s profit and loss. Invoices raised but not yet paid are on{' '}
          <Link href="/dashboard/money" style={{ color: 'var(--accent)' }}>Money</Link>.
        </p>
      </section>

      <MoneyChart
        inData={inPoints}
        outData={outPoints}
        inTotal={fmtBig(Math.round(current.inc))}
        outTotal={fmtBig(Math.round(current.out))}
        inDelta={previous.inc === 0 ? undefined : ((current.inc - previous.inc) / Math.abs(previous.inc)) * 100}
        outDelta={previous.out === 0 ? undefined : ((current.out - previous.out) / Math.abs(previous.out)) * 100}
        caption={`Live from Xero · ${rangeLabel}`}
        control={
          <CustomSelect
            value={String(months)}
            onChange={(v) => setMonths(Number(v) as MonthsWindow)}
            options={[
              { value: '3', label: 'Last 3 months' },
              { value: '6', label: 'Last 6 months' },
              { value: '12', label: 'Last 12 months' },
            ]}
            className="flow-range"
          />
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <p className="label" style={{ marginBottom: 10 }}>Cash and runway</p>
          <CashAndRunway balance={summary.bank_balance_nzd} burn={avgMonthlyBurn} runway={runwayMonths} />
        </div>
        <div className="card">
          <p className="label" style={{ marginBottom: 14 }}>Who paid the most</p>
          <TopClients clients={topClients} />
        </div>
      </div>

      <TxTable txs={filtered} />
    </div>
  )
}
