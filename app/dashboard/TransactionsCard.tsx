'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'

export type RecentTx = {
  id: string
  date: string // YYYY-MM-DD
  type: 'in' | 'out'
  description: string
  reference: string | null
  status: string
  amount: number
}

const MIN_ROWS = 3
const STACKED_ROWS = 5

const fmtShort = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

function fmtTxDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * The latest money movements as their own card, the same card as
 * "Transactions" on Finance (app/dashboard/finance/FinanceDashboard.tsx
 * TxTable): same header, same five columns, same arrows, badges and amounts.
 * Keep the two in step by eye; they are separate because Finance's carries
 * paging, period totals and its own state.
 *
 * In `fill` mode it sits under the money chart and the two cards share the
 * left column's spare height, so a longer right column makes the chart taller
 * AND the list longer. It shows as many whole rows as fit, never a half-cut
 * one: row and header heights are measured off the rendered table rather than
 * assumed, and the rows are drawn absolutely so the table can't feed its own
 * height back into the column it is measuring.
 *
 * Stacked (one column) there is nothing to match, so it's a fixed five.
 */
export default function TransactionsCard({ transactions: txs, fill = false }: { transactions: RecentTx[] | null; fill?: boolean }) {
  const transactions = txs ?? []
  const [rows, setRows] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const slotRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height
      const head = el.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const row = el.querySelector('tbody tr')?.getBoundingClientRect().height ?? 0
      if (h > 0 && row > 0) setRows(Math.max(MIN_ROWS, Math.floor((h - head) / row)))
    })
    ro.observe(el)
    observerRef.current = ro
  }, [])

  // Until measured, render plenty and let the slot's overflow hide the excess.
  const count = fill ? (rows ?? transactions.length) : STACKED_ROWS
  const shown = transactions.slice(0, count)

  const table = (
    <div className="tx-table-wrap">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--bg-border)' }}>
            {['Date', 'Description', 'Ref', 'Status', 'Amount'].map((h) => (
              <th
                key={h}
                className={h === 'Ref' ? 'tx-col-ref' : h === 'Status' ? 'tx-col-status' : undefined}
                style={{
                  padding: '5px 10px', textAlign: h === 'Amount' ? 'right' : 'left',
                  color: 'var(--text-tertiary)', fontWeight: 500,
                  fontSize: 'var(--t-xs)', whiteSpace: 'nowrap',
                }}
              >{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((tx, i) => (
            <tr key={tx.id + i} style={{ borderBottom: '1px solid var(--bg-border)' }}>
              <td style={{ padding: '8px 10px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontSize: 'var(--t-xs)' }}>{fmtTxDate(tx.date)}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-primary)', maxWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {tx.type === 'in'
                    ? <ArrowDownLeft style={{ width: 12, height: 12, color: 'var(--success)', flexShrink: 0 }} />
                    : <ArrowUpRight style={{ width: 12, height: 12, color: 'var(--danger)', flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                </div>
              </td>
              <td className="tx-col-ref" style={{ padding: '8px 10px', color: 'var(--text-tertiary)', fontSize: 'var(--t-2xs)' }}>{tx.reference ?? '—'}</td>
              <td className="tx-col-status" style={{ padding: '8px 10px' }}>
                <span style={{
                  fontSize: 'var(--t-2xs)', padding: '2px 7px', borderRadius: 999, fontWeight: 500,
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
  )

  return (
    <section className={`today-tx${fill ? ' tx-fill' : ''}`}>
      <div className="section-head">
        <h2 className="section-heading">Transactions</h2>
        <Link href="/dashboard/finance" className="section-head-meta" style={{ color: 'var(--accent)' }}>
          Finance ↗
        </Link>
      </div>
      <div className="card tx-card" style={{ padding: '18px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-tertiary)', fontWeight: 500 }}>Recent</span>
        </div>
        {transactions.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-tertiary)', padding: '12px 0' }}>
            {txs === null ? "Couldn't reach Xero for transactions just now." : 'Nothing recent from Xero.'}
          </p>
        ) : fill ? (
          <div ref={slotRef} className="tx-slot">
            <div className="tx-abs">{table}</div>
          </div>
        ) : (
          table
        )}
      </div>
    </section>
  )
}

// Placeholder rows in the same card, so the Xero wait does not end in the
// column changing shape.
export function TxSkeleton({ fill = false }: { fill?: boolean }) {
  return (
    <section className={`today-tx${fill ? ' tx-fill' : ''}`}>
      <div className="section-head"><h2 className="section-heading">Transactions</h2></div>
      <div className="card tx-card" style={{ padding: '18px 20px 16px' }}>
        <div className="tx-slot">
          <div className="tx-abs">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderBottom: '1px solid var(--bg-border)' }}>
                <div className="skeleton" style={{ width: 52, height: 11 }} />
                <div className="skeleton" style={{ flex: 1, height: 12, maxWidth: `${70 - i * 8}%` }} />
                <div className="skeleton" style={{ width: 44, height: 12, marginLeft: 'auto' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
