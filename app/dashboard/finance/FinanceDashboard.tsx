'use client'

import { useState, useMemo, useId, useRef } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import type { XeroSummary, XeroTransaction } from '@/lib/xero'

// ─── Types & helpers ──────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'year' | 'all'

const fmtShort = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

const fmtBig = (n: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n)

function periodRange(period: Period): { start: string; label: string } {
  const now = new Date()
  if (period === 'week') {
    const d = new Date(now); d.setDate(now.getDate() - 6)
    return {
      start: d.toISOString().slice(0, 10),
      label: `${d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }
  }
  if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      start: d.toISOString().slice(0, 10),
      label: `${d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }
  }
  if (period === 'year') {
    const d = new Date(now.getFullYear(), 0, 1)
    return {
      start: d.toISOString().slice(0, 10),
      label: `1 Jan ${now.getFullYear()} – ${now.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }
  }
  return { start: '2000-01-01', label: 'All time' }
}

function filterTx(txs: XeroTransaction[], period: Period) {
  const { start } = periodRange(period)
  return txs.filter((t) => t.date >= start)
}

// Generic grouping for revenue, expenses, or net profit
function groupByPeriod(txs: XeroTransaction[], period: Period, kind: 'in' | 'out' | 'net') {
  const paid = txs.filter((t) => t.status === 'PAID')
  const now = new Date()

  const calc = (subset: XeroTransaction[]) => {
    if (kind === 'in') return Math.round(subset.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0))
    if (kind === 'out') return Math.round(subset.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0))
    const r = subset.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0)
    const e = subset.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0)
    return Math.round(r - e)
  }

  if (period === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(now.getDate() - (6 - i))
      const key = d.toISOString().slice(0, 10)
      return { label: d.toLocaleDateString('en-NZ', { weekday: 'short' }), value: calc(paid.filter((t) => t.date === key)) }
    })
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const weeks: { label: string; s: string; e: string }[] = []
    let cur = new Date(start); let wk = 1
    while (cur <= now) {
      const s = cur.toISOString().slice(0, 10)
      const e = new Date(Math.min(cur.getTime() + 6 * 86400000, now.getTime())).toISOString().slice(0, 10)
      weeks.push({ label: `W${wk}`, s, e })
      cur = new Date(cur.getTime() + 7 * 86400000); wk++
    }
    return weeks.map(({ label, s, e }) => ({ label, value: calc(paid.filter((t) => t.date >= s && t.date <= e)) }))
  }

  if (period === 'year') {
    // Only months that have happened. Plotting Oct-Dec as zero draws a cliff
    // to the right of today and reads as revenue collapsing, when it just
    // means the year is not over.
    return Array.from({ length: now.getMonth() + 1 }, (_, m) => {
      const key = `${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`
      const label = new Date(now.getFullYear(), m, 1).toLocaleString('en-NZ', { month: 'short' })
      return { label, value: calc(paid.filter((t) => t.date.startsWith(key))) }
    })
  }

  // Fallback: rolling 12 months
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { label: d.toLocaleString('en-NZ', { month: 'short' }), value: calc(paid.filter((t) => t.date.startsWith(key))) }
  })
}

// ─── Previous-period comparison ───────────────────────────────────────────────

// Every figure on this page is now stated against the equivalent span before it.
// An absolute number ("$16,483") is unreadable on its own — up or down is the
// only question anyone actually has, and the old page never answered it.
function previousRange(period: Period): { start: string; end: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'week') {
    const end = new Date(now); end.setDate(now.getDate() - 7)
    const start = new Date(now); start.setDate(now.getDate() - 13)
    return { start: iso(start), end: iso(end) }
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    // Same day-of-month as today, so a part-month compares against a part-month
    // rather than against a full one — which would always look like a collapse.
    const end = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    return { start: iso(start), end: iso(end) }
  }
  const start = new Date(now.getFullYear() - 1, 0, 1)
  const end = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  return { start: iso(start), end: iso(end) }
}

function totalsFor(txs: XeroTransaction[], start: string, end: string) {
  const paid = txs.filter((t) => t.status === 'PAID' && t.date >= start && t.date <= end)
  const inc = paid.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0)
  const out = paid.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0)
  return { inc, out, net: inc - out }
}

const PERIOD_NOUN: Record<Period, string> = {
  week: 'last week',
  month: 'last month',
  year: 'last year',
  all: 'the period before',
}

// ─── Chart scale ──────────────────────────────────────────────────────────────

// Clean axis ticks — 0 / 5,000 / 10,000, never 0 / 4,317 / 8,634.
function niceScale(peak: number, ticks = 4): { max: number; step: number } {
  if (peak <= 0) return { max: 100, step: 25 }
  const raw = peak / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  // 1 / 2 / 5 / 10 only. A 2.5 step is "nice" arithmetically and unreadable in
  // practice: rounded to whole thousands it printed 0 / 3k / 5k / 8k / 10k,
  // labels that disagree with their own evenly-spaced gridlines.
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  // Round the top up to the first step above the peak, rather than always
  // taking step × ticks. The old form drew a 20k axis over a 9.8k peak and
  // spent half the plot on empty space.
  return { max: Math.ceil(peak / step) * step, step }
}

const AXIS_FMT = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))

// ─── Money flow chart ─────────────────────────────────────────────────────────

type Series = { key: 'in' | 'out'; label: string; color: string; dashed?: boolean; points: number[] }

// One chart replacing three, and it sits on the page rather than in a box.
//
// The page used to carry three ~60px charts — revenue area, net-profit bars,
// expenses bars — none of which had an axis, a gridline or a hover value. You
// could see a shape and read nothing off it, and net profit was a third chart
// showing the arithmetic of the other two.
//
// This is one plot, one y-axis (never two — the scales would be arbitrary and
// would invent a correlation), with revenue and expenses as two lines. Net
// profit is the gap between them, which is what it actually is.
//
// Full-bleed on purpose: the chart is the page's centrepiece, and a card
// border around it made it read as one tile among several.
function FlowChart({
  labels,
  series,
  height = 260,
}: {
  labels: string[]
  series: Series[]
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const titleId = useId()

  // Generous left gutter so a "$10.4k" tick never crowds the plot, and a tall
  // bottom band so month labels have room at any width.
  const PAD = { top: 14, right: 16, bottom: 34, left: 58 }
  const W = 1000
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const peak = Math.max(1, ...series.flatMap((s) => s.points))
  const { max, step } = niceScale(peak)
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)

  const x = (i: number) => PAD.left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    // The reader aims at a month, never at a 2px line — snap to the nearest
    // data position across the full height of the plot.
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = (px - PAD.left) / plotW
    const idx = Math.round(t * (labels.length - 1))
    setHover(Math.max(0, Math.min(labels.length - 1, idx)))
  }

  const hoverIn = hover != null ? (series.find((s) => s.key === 'in')?.points[hover] ?? 0) : 0
  const hoverOut = hover != null ? (series.find((s) => s.key === 'out')?.points[hover] ?? 0) : 0

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
        className="flow-chart-svg"
        style={{ display: 'block', touchAction: 'pan-y' }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <title id={titleId}>Money in and money out over the selected period</title>

        {/* Gridlines — solid hairlines, one step off the surface, recessive. */}
        {ticks.map((t) => (
          <line
            key={t}
            x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
            stroke="var(--bg-border)" strokeWidth={1}
            vectorEffect="non-scaling-stroke" shapeRendering="crispEdges"
          />
        ))}

        {series.map((s) => (
          <polyline
            key={s.key}
            points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none" stroke={s.color} strokeWidth={2}
            strokeDasharray={s.dashed ? '5 5' : undefined}
            strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Crosshair sits above the grid but below the markers. */}
        {hover != null && (
          <line
            x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH}
            stroke="var(--text-tertiary)" strokeWidth={1} opacity={0.55}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* End markers, each with a 2px surface ring so they stay legible
            where the two lines cross. */}
        {series.map((s) => {
          const i = s.points.length - 1
          return (
            <circle
              key={s.key} cx={x(i)} cy={y(s.points[i])} r={4}
              fill={s.color} stroke="var(--bg-base)" strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        {hover != null && series.map((s) => (
          <circle
            key={s.key} cx={x(hover)} cy={y(s.points[hover])} r={4.5}
            fill={s.color} stroke="var(--bg-base)" strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Axis labels are HTML, not SVG text.
          In SVG they scale with the viewBox, so the same chart rendered "$2.8k"
          at readable size on a desktop and at about six pixels on a phone —
          the one complaint about the chart this replaces. As positioned HTML
          they hold their real type size at every width. */}
      <div aria-hidden="true" className="flow-axis-y">
        {ticks.map((t) => (
          <span key={t} style={{ top: `${(y(t) / height) * 100}%` }}>{AXIS_FMT(t)}</span>
        ))}
      </div>

      <div aria-hidden="true" className="flow-axis-x">
        {labels.map((l, i) => {
          // Thin the labels rather than shrink them: on a narrow screen you get
          // fewer months, not unreadable ones.
          const keep = labels.length <= 7 ? 1 : Math.ceil(labels.length / 6)
          if (i % keep !== 0 && i !== labels.length - 1) return null
          return (
            <span key={l + i} style={{ left: `${(x(i) / W) * 100}%` }}>{l}</span>
          )
        })}
      </div>

      {/* Readout — value leads, series name follows. */}
      {hover != null && (
        <div
          className="flow-tooltip"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > labels.length / 2 ? 'translate(calc(-100% - 14px), 0)' : 'translate(14px, 0)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 5 }}>{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <span style={{ width: 10, height: 2, borderRadius: 1, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtBig(s.points[hover])}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.label}</span>
            </div>
          ))}
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--bg-border)', fontSize: 11, color: 'var(--text-secondary)' }}>
            Net{' '}
            <span style={{ fontWeight: 600, color: hoverIn - hoverOut < 0 ? 'var(--danger)' : 'var(--success)' }}>
              {fmtBig(hoverIn - hoverOut)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// The chart's own table twin — every value the tooltip shows, reachable
// without a pointer.
function FlowTable({ labels, series }: { labels: string[]; series: Series[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <th style={thStyle('left')}>Period</th>
            {series.map((s) => <th key={s.key} style={thStyle('right')}>{s.label}</th>)}
            <th style={thStyle('right')}>Net</th>
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => {
            const inc = series.find((s) => s.key === 'in')?.points[i] ?? 0
            const out = series.find((s) => s.key === 'out')?.points[i] ?? 0
            return (
              <tr key={l + i} style={{ borderBottom: '1px solid var(--bg-border)' }}>
                <td style={tdStyle('left')}>{l}</td>
                <td style={tdStyle('right')}>{fmtBig(inc)}</td>
                <td style={tdStyle('right')}>{fmtBig(out)}</td>
                <td style={{ ...tdStyle('right'), color: inc - out < 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {fmtBig(inc - out)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thStyle = (align: 'left' | 'right') => ({
  padding: '5px 10px', textAlign: align,
  color: 'var(--text-tertiary)', fontWeight: 500,
  textTransform: 'uppercase' as const, fontSize: 10, letterSpacing: '0.05em',
})
const tdStyle = (align: 'left' | 'right') => ({
  padding: '7px 10px', textAlign: align,
  color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' as const,
})

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

// The compact form, sitting inline beside a figure. Same rule as Delta: red
// and green mean "worse" and "better", not "down" and "up" — spending more is
// not an improvement.
function DeltaPill({ now, before, goodWhenUp = true }: { now: number; before: number; goodWhenUp?: boolean }) {
  if (before === 0) return null
  const pct = Math.round(((now - before) / Math.abs(before)) * 100)
  if (pct === 0) return null
  const good = (pct > 0) === goodWhenUp
  return (
    <span
      className="flow-delta-pill"
      style={{
        color: good ? 'var(--success)' : 'var(--danger)',
        background: good
          ? 'color-mix(in srgb, var(--success) 14%, transparent)'
          : 'color-mix(in srgb, var(--danger) 14%, transparent)',
      }}
    >
      {pct > 0 ? '↑' : '↓'}{Math.abs(pct)}%
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
  retainerInvoiceDay,
}: {
  summary: XeroSummary
  transactions: XeroTransaction[]
  retainerInvoiceDay?: number
}) {
  const [period, setPeriod] = useState<Period>('year')
  const [asTable, setAsTable] = useState(false)
  const { label: rangeLabel, start: periodStart } = periodRange(period)

  const filtered = useMemo(() => filterTx(transactions, period), [transactions, period])

  const today = new Date().toISOString().slice(0, 10)
  const current = useMemo(() => totalsFor(transactions, periodStart, today), [transactions, periodStart, today])
  const previous = useMemo(() => {
    const { start, end } = previousRange(period)
    return totalsFor(transactions, start, end)
  }, [transactions, period])

  const inPoints = useMemo(() => groupByPeriod(filtered, period, 'in'), [filtered, period])
  const outPoints = useMemo(() => groupByPeriod(filtered, period, 'out'), [filtered, period])

  const chartLabels = inPoints.map((p) => p.label)
  const chartSeries: Series[] = [
    { key: 'in', label: 'In', color: 'var(--chart-in)', points: inPoints.map((p) => p.value) },
    { key: 'out', label: 'Out', color: 'var(--chart-out)', points: outPoints.map((p) => p.value) },
  ]

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

  // Burn is measured over whole past months only — the current month is
  // partial, and including it drags the average down and flatters runway.
  const avgMonthlyBurn = useMemo(() => {
    const now = new Date()
    let total = 0
    let months = 0
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const spend = transactions
        .filter((t) => t.type === 'out' && t.status === 'PAID' && t.date.startsWith(key))
        .reduce((s, t) => s + t.amount, 0)
      if (spend > 0) { total += spend; months++ }
    }
    return months > 0 ? total / months : 0
  }, [transactions])

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

      {/* Header */}
      <div>
        <h1 className="page-title">Finance</h1>
        <p className="page-subtitle">
          Live from {summary.org_name ?? 'Xero'}. For who owes what, see{' '}
          <Link href="/dashboard/money" style={{ color: 'var(--accent)' }}>Money</Link>.
        </p>
      </div>

      {/* The hero, and deliberately not in a card. It is the page's answer, not
          one tile among several — a box around it made it compete with the
          chart instead of introducing it.

          Money in and money out used to be repeated here as well as on the
          chart below, one directly above the other. The chart owns them now. */}
      <section>
        <p className="label" style={{ marginBottom: 6 }}>
          {losing ? 'Net loss' : 'Net profit'} · {period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'this year'}
        </p>
        <p className="finance-hero" style={{ color: losing ? 'var(--danger)' : 'var(--text-primary)' }}>
          {fmtBig(Math.round(current.net))}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '10px 0 0' }}>
          <Delta now={current.net} before={previous.net} against={PERIOD_NOUN[period]} />
          {losing && ' · you are spending more than you are bringing in'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
          Money that has actually moved. Invoices raised but not yet paid are on{' '}
          <Link href="/dashboard/money" style={{ color: 'var(--accent)' }}>Money</Link>.
        </p>
      </section>

      {/* The chart is the page's centrepiece, so it sits ON the page rather
          than inside a card. Its own figures carry the legend — a coloured key
          beside the number the reader is already looking at beats a legend box
          off to one side. */}
      <section className="flow-block">
        <div className="flow-head">
          <div className="flow-figures">
            {[
              { key: 'in', label: 'Money in', value: current.inc, prev: previous.inc, color: 'var(--chart-in)', goodWhenUp: true },
              { key: 'out', label: 'Money out', value: current.out, prev: previous.out, color: 'var(--chart-out)', goodWhenUp: false },
            ].map((f) => (
              <div key={f.key}>
                <p className="flow-figure-label">
                  <span className="flow-key" style={{ background: f.color }} />
                  {f.label}
                </p>
                <p className="flow-figure-value">
                  {fmtBig(Math.round(f.value))}
                  <DeltaPill now={f.value} before={f.prev} goodWhenUp={f.goodWhenUp} />
                </p>
              </div>
            ))}
          </div>

          <div className="flow-controls">
            <CustomSelect
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              options={[
                { value: 'week', label: 'Last 7 days' },
                { value: 'month', label: 'This month' },
                { value: 'year', label: 'This year' },
              ]}
              className="flow-range"
            />
            <button className="btn-secondary btn-sm" onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'Show chart' : 'Show table'}
            </button>
          </div>
        </div>

        {asTable ? (
          <FlowTable labels={chartLabels} series={chartSeries} />
        ) : (
          <FlowChart labels={chartLabels} series={chartSeries} />
        )}

        <p className="flow-caption">
          Live from Xero · {rangeLabel}
          {inPoints.length > 0 && ` · ${inPoints[inPoints.length - 1].label} is still in progress`}
        </p>
      </section>

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
