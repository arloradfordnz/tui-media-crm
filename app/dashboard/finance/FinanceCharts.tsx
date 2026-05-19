'use client'

import { useState } from 'react'

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

// ─── Revenue vs Expenses grouped bar chart ───────────────────────────────────

export type MonthlyBar = {
  label: string   // "Jan", "Feb" etc
  revenue: number
  expenses: number
}

export function RevenueExpenseChart({ data }: { data: MonthlyBar[] }) {
  const [hover, setHover] = useState<{ i: number; kind: 'revenue' | 'expenses' } | null>(null)
  const max = Math.max(...data.flatMap((d) => [d.revenue, d.expenses]), 1)

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Revenue vs Expenses
        </h2>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--success) 70%, transparent)', display: 'inline-block' }} />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--danger) 55%, transparent)', display: 'inline-block' }} />
            Expenses
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-44 w-full pb-1 px-1">
        {data.map((d, i) => {
          const revPct = d.revenue / max
          const expPct = d.expenses / max
          const hoverRev = hover?.i === i && hover.kind === 'revenue'
          const hoverExp = hover?.i === i && hover.kind === 'expenses'

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              {/* Tooltip */}
              <div
                className="text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--bg-border)',
                  opacity: (hoverRev || hoverExp) ? 1 : 0,
                  transition: 'opacity 100ms',
                  pointerEvents: 'none',
                }}
              >
                {hoverRev ? fmt(d.revenue) : fmt(d.expenses)}
              </div>

              {/* Grouped bars */}
              <div className="w-full flex gap-0.5 items-end" style={{ height: '85%' }}>
                {/* Revenue bar */}
                <div
                  className="flex-1 rounded-t-sm cursor-default"
                  style={{
                    height: d.revenue === 0 ? '3px' : `${Math.max(revPct * 100, 3)}%`,
                    background: hoverRev
                      ? 'var(--success)'
                      : d.revenue === 0
                      ? 'var(--bg-elevated)'
                      : 'color-mix(in srgb, var(--success) 60%, transparent)',
                    transition: 'background 120ms, height 120ms',
                    borderRadius: '4px 4px 2px 2px',
                  }}
                  onMouseEnter={() => setHover({ i, kind: 'revenue' })}
                  onMouseLeave={() => setHover(null)}
                />
                {/* Expenses bar */}
                <div
                  className="flex-1 rounded-t-sm cursor-default"
                  style={{
                    height: d.expenses === 0 ? '3px' : `${Math.max(expPct * 100, 3)}%`,
                    background: hoverExp
                      ? 'var(--danger)'
                      : d.expenses === 0
                      ? 'var(--bg-elevated)'
                      : 'color-mix(in srgb, var(--danger) 50%, transparent)',
                    transition: 'background 120ms, height 120ms',
                    borderRadius: '4px 4px 2px 2px',
                  }}
                  onMouseEnter={() => setHover({ i, kind: 'expenses' })}
                  onMouseLeave={() => setHover(null)}
                />
              </div>

              {/* Label */}
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Net cashflow line chart ──────────────────────────────────────────────────

export type NetPoint = { label: string; net: number }

export function NetCashflowChart({ data }: { data: NetPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const vals = data.map((d) => d.net)
  const minVal = Math.min(...vals, 0)
  const maxVal = Math.max(...vals, 1)
  const range = maxVal - minVal || 1

  const W = 600
  const H = 120
  const PAD = 16

  const pts = data.map((d, i) => {
    const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2)
    const y = H - PAD - ((d.net - minVal) / range) * (H - PAD * 2)
    return { x, y, ...d }
  })

  const pathD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  const fillD = pts.length > 1
    ? `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${H} L ${pts[0].x.toFixed(1)} ${H} Z`
    : ''

  // Zero line y
  const zeroY = H - PAD - ((0 - minVal) / range) * (H - PAD * 2)

  return (
    <div className="card space-y-3">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        Net Cashflow
      </h2>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          {/* Zero line */}
          {minVal < 0 && (
            <line
              x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY}
              stroke="var(--bg-border)" strokeWidth="1" strokeDasharray="4 3"
            />
          )}

          {/* Area fill */}
          {fillD && (
            <path
              d={fillD}
              fill="url(#netGrad)"
              opacity={0.35}
            />
          )}

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Gradient */}
          <defs>
            <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Dots + hit areas */}
          {pts.map((p, i) => (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'default' }}
            >
              <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
              {hover === i && (
                <>
                  <line x1={p.x} y1={PAD} x2={p.x} y2={H - PAD}
                    stroke="var(--bg-border)" strokeWidth="1" strokeDasharray="3 2" />
                  <circle cx={p.x} cy={p.y} r={5} fill="var(--accent)" />
                  <rect
                    x={Math.min(p.x - 28, W - 72)} y={p.y - 28}
                    width={70} height={20} rx={5}
                    fill="var(--bg-elevated)"
                    stroke="var(--bg-border)" strokeWidth="1"
                  />
                  <text
                    x={Math.min(p.x - 28, W - 72) + 35} y={p.y - 14}
                    fill={p.net >= 0 ? 'var(--success)' : 'var(--danger)'}
                    fontSize="11" fontWeight="600" textAnchor="middle"
                    style={{ fontFamily: 'inherit' }}
                  >
                    {p.net >= 0 ? '+' : ''}{fmt(p.net)}
                  </text>
                </>
              )}
            </g>
          ))}

          {/* X axis labels */}
          {pts.map((p, i) => (
            <text
              key={i} x={p.x} y={H + 2} textAnchor="middle"
              fill="var(--text-tertiary)" fontSize="10"
              style={{ fontFamily: 'inherit' }}
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

// ─── Top clients horizontal bars ─────────────────────────────────────────────

export type ClientRevenue = { name: string; total: number; count: number }

export function TopClientsChart({ clients }: { clients: ClientRevenue[] }) {
  const max = Math.max(...clients.map((c) => c.total), 1)

  return (
    <div className="card space-y-4">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        Top Clients
      </h2>
      <div className="space-y-3">
        {clients.map((c, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.name}</span>
              <div className="flex items-center gap-3">
                <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                  {c.count} invoice{c.count !== 1 ? 's' : ''}
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(c.total)}
                </span>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(c.total / max) * 100}%`,
                background: i === 0
                  ? 'var(--accent)'
                  : `color-mix(in srgb, var(--accent) ${80 - i * 12}%, transparent)`,
                borderRadius: 3,
                transition: 'width 400ms ease',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Invoice health donut ─────────────────────────────────────────────────────

export type InvoiceHealth = {
  paidCount: number; paidTotal: number
  outstandingCount: number; outstandingTotal: number
  overdueCount: number; overdueTotal: number
}

export function InvoiceHealthChart({ health }: { health: InvoiceHealth }) {
  const total = health.paidTotal + health.outstandingTotal + health.overdueTotal || 1
  const paidPct = (health.paidTotal / total) * 100
  const outPct = (health.outstandingTotal / total) * 100
  const overduePct = (health.overdueTotal / total) * 100

  // SVG donut
  const R = 42
  const CX = 60
  const CY = 60
  const CIRC = 2 * Math.PI * R

  type Segment = { pct: number; color: string; label: string; count: number; amount: number }
  const segments: Segment[] = [
    { pct: paidPct, color: 'var(--success)', label: 'Paid', count: health.paidCount, amount: health.paidTotal },
    { pct: outPct, color: 'var(--accent)', label: 'Outstanding', count: health.outstandingCount, amount: health.outstandingTotal },
    { pct: overduePct, color: 'var(--danger)', label: 'Overdue', count: health.overdueCount, amount: health.overdueTotal },
  ]

  let offset = 0
  const arcs = segments.map((s) => {
    const dash = (s.pct / 100) * CIRC
    const gap = CIRC - dash
    const currentOffset = -offset
    offset += dash
    return { ...s, dash, gap, offset: currentOffset }
  })

  const [hover, setHover] = useState<number | null>(null)

  return (
    <div className="card space-y-4">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        Invoice Health
      </h2>
      <div className="flex items-center gap-6">
        {/* Donut */}
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--bg-elevated)" strokeWidth="14" />
          {arcs.map((arc, i) => (
            arc.dash > 0 && (
              <circle
                key={i}
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke={arc.color}
                strokeWidth={hover === i ? 16 : 13}
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: `${CX}px ${CY}px`,
                  transition: 'stroke-width 150ms',
                  cursor: 'default',
                  opacity: hover !== null && hover !== i ? 0.5 : 1,
                }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            )
          ))}
          {/* Centre text */}
          <text x={CX} y={CY - 4} textAnchor="middle" fill="var(--text-primary)"
            fontSize="14" fontWeight="700" style={{ fontFamily: 'inherit' }}>
            {Math.round(paidPct)}%
          </text>
          <text x={CX} y={CY + 12} textAnchor="middle" fill="var(--text-tertiary)"
            fontSize="9" style={{ fontFamily: 'inherit' }}>
            collected
          </text>
        </svg>

        {/* Legend */}
        <div className="space-y-3 flex-1 min-w-0">
          {segments.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-sm"
              style={{ opacity: hover !== null && hover !== i ? 0.4 : 1, transition: 'opacity 150ms', cursor: 'default' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '12px' }}>
                  {s.label}
                </span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>×{s.count}</span>
              </div>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: '13px' }}>
                {fmt(s.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Key metrics grid ─────────────────────────────────────────────────────────

export type FinanceMetrics = {
  avgInvoiceValue: number
  totalBilledYTD: number
  totalCollectedYTD: number
  collectionRate: number   // 0–100
  totalExpensesYTD: number
  netProfitYTD: number
}

export function KeyMetrics({ metrics }: { metrics: FinanceMetrics }) {
  const items = [
    { label: 'Avg Invoice', value: fmt(metrics.avgInvoiceValue) },
    { label: 'Billed YTD', value: fmt(metrics.totalBilledYTD) },
    { label: 'Collected YTD', value: fmt(metrics.totalCollectedYTD) },
    { label: 'Collection Rate', value: `${Math.round(metrics.collectionRate)}%` },
    { label: 'Expenses YTD', value: fmt(metrics.totalExpensesYTD) },
    { label: 'Net Profit YTD', value: fmt(metrics.netProfitYTD) },
  ]

  return (
    <div className="card space-y-4">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        Key Metrics
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {item.label}
            </div>
            <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
