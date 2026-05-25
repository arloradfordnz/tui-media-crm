'use client'

import { useState, useMemo, useId, useRef, useEffect, useCallback } from 'react'
import { ArrowDownLeft, ArrowUpRight, Calendar, Plus, X, Search, Check } from 'lucide-react'
import type { XeroSummary, XeroTransaction, XeroContact } from '@/lib/xero'

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
    return Array.from({ length: 12 }, (_, m) => {
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

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({
  title, metric, sub, children, wide, chartBottom,
}: {
  title: string
  metric?: string
  sub?: string
  children?: React.ReactNode
  wide?: boolean
  chartBottom?: boolean
}) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: '18px 20px 16px',
        gridColumn: wide ? '1 / -1' : undefined,
      }}
    >
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: '22px', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
          {title}
        </h2>
      </div>
      {metric && (
        <div style={{ fontSize: '20px', fontWeight: 400, color: 'var(--text-secondary)', marginBottom: 10, letterSpacing: '-0.01em' }}>
          {metric}
        </div>
      )}
      {sub && (
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: 10 }}>{sub}</div>
      )}
      {children && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Area / line chart ────────────────────────────────────────────────────────

type AreaIndicator = { x: number; y: number; nearestIdx: number }

function AreaChart({ points, color = 'var(--accent)' }: { points: { label: string; value: number }[]; color?: string }) {
  const [indicator, setIndicator] = useState<AreaIndicator | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = useId().replace(/:/g, '')
  const gradId = `ag${uid}`
  const clipId = `cl${uid}`

  const max = Math.max(...points.map((p) => Math.max(0, p.value)), 1)

  const W = 600
  const H = 120
  const Y_W = 28
  const PAD_R = 22
  const PAD_T = 16
  const PAD_B = 14
  const chartW = W - Y_W - PAD_R
  const chartH = H - PAD_T - PAD_B
  const fillBottom = PAD_T + chartH

  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const frac = i / 3
    return { y: PAD_T + chartH - frac * chartH, val: frac * max }
  })

  const xs = points.map((_, i) =>
    Y_W + (i / Math.max(points.length - 1, 1)) * chartW
  )
  const ys = points.map((p) => {
    const v = Math.max(0, p.value)
    return PAD_T + chartH - (v / max) * chartH
  })

  function smooth(pts: number[][]): string {
    if (pts.length < 2) return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
    const clampY = (y: number) => Math.max(PAD_T, Math.min(fillBottom, y))
    let d = `M${pts[0][0]},${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(i + 2, pts.length - 1)]
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6
      const cp1y = clampY(p1[1] + (p2[1] - p0[1]) / 6)
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6
      const cp2y = clampY(p2[1] - (p3[1] - p1[1]) / 6)
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0]},${p2[1]}`
    }
    return d
  }

  const linePath = smooth(xs.map((x, i) => [x, ys[i]]))
  const fillPath = `${linePath} L${xs[xs.length - 1]},${fillBottom} L${xs[0]},${fillBottom} Z`

  // Precompute bezier control points for each segment (matches smooth() exactly)
  const clampY = (y: number) => Math.max(PAD_T, Math.min(fillBottom, y))
  const bezierSegs = xs.length >= 2 ? Array.from({ length: xs.length - 1 }, (_, i) => {
    const p0 = [xs[Math.max(i - 1, 0)], ys[Math.max(i - 1, 0)]]
    const p1 = [xs[i], ys[i]]
    const p2 = [xs[i + 1], ys[i + 1]]
    const p3 = [xs[Math.min(i + 2, xs.length - 1)], ys[Math.min(i + 2, xs.length - 1)]]
    return {
      x1: p1[0], y1: p1[1],
      cx1: p1[0] + (p2[0] - p0[0]) / 6,
      cy1: clampY(p1[1] + (p2[1] - p0[1]) / 6),
      cx2: p2[0] - (p3[0] - p1[0]) / 6,
      cy2: clampY(p2[1] - (p3[1] - p1[1]) / 6),
      x2: p2[0], y2: p2[1],
    }
  }) : []

  function evalBezier(seg: (typeof bezierSegs)[0], t: number) {
    const mt = 1 - t
    return {
      x: mt*mt*mt*seg.x1 + 3*mt*mt*t*seg.cx1 + 3*mt*t*t*seg.cx2 + t*t*t*seg.x2,
      y: mt*mt*mt*seg.y1 + 3*mt*mt*t*seg.cy1 + 3*mt*t*t*seg.cy2 + t*t*t*seg.y2,
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!svgRef.current || xs.length < 2) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const clamped = Math.max(xs[0], Math.min(xs[xs.length - 1], svgX))

    // Find segment
    let segIdx = xs.length - 2
    for (let i = 0; i < xs.length - 1; i++) {
      if (clamped <= xs[i + 1]) { segIdx = i; break }
    }

    // Binary search for t where bezier x ≈ clamped (follows the actual curve)
    const seg = bezierSegs[segIdx]
    let lo = 0, hi = 1
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2
      if (evalBezier(seg, mid).x < clamped) lo = mid
      else hi = mid
    }
    const interpY = evalBezier(seg, (lo + hi) / 2).y

    const nearestIdx = xs.reduce((best, x, i) =>
      Math.abs(x - clamped) < Math.abs(xs[best] - clamped) ? i : best, 0)

    setIndicator({ x: clamped, y: interpY, nearestIdx })
  }

  const tipValue = indicator != null ? points[indicator.nearestIdx]?.value ?? 0 : 0
  const tipX = indicator ? Math.max(Y_W + 2, Math.min(indicator.x - 15, W - PAD_R - 32)) : 0
  const tipY = indicator ? Math.max(PAD_T + 2, indicator.y - 15) : 0

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', marginTop: 4, overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x={Y_W} y={PAD_T - 1} width={chartW} height={chartH + 2} />
        </clipPath>
      </defs>

      {/* Y-labels + grid lines */}
      {gridLines.map((gl, i) => (
        <g key={i}>
          <text x={0} y={gl.y + 3} textAnchor="start" fill="var(--text-tertiary)" fontSize="6.5" style={{ fontFamily: 'inherit' }}>
            {fmtShort(gl.val)}
          </text>
          <line x1={Y_W} y1={gl.y} x2={W - PAD_R} y2={gl.y} stroke="var(--bg-border)" strokeWidth="0.5" opacity="0.5" />
        </g>
      ))}

      {/* Clipped fill + line */}
      <g clipPath={`url(#${clipId})`}>
        <path d={fillPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </g>

      {/* X-axis labels */}
      {xs.map((x, i) => (
        <text
          key={i} x={x} y={H - 2} textAnchor="middle"
          fill={indicator?.nearestIdx === i ? color : 'var(--text-tertiary)'}
          fontSize="6.5" style={{ fontFamily: 'inherit', transition: 'fill 120ms' }}
        >
          {points[i].label}
        </text>
      ))}

      {/* Sliding indicator — rendered above everything */}
      {indicator && (
        <>
          <line
            x1={indicator.x} y1={PAD_T} x2={indicator.x} y2={fillBottom}
            stroke="var(--bg-border)" strokeWidth="0.8"
          />
          <circle cx={indicator.x} cy={indicator.y} r={3} fill={color} />
          <rect x={tipX} y={tipY} width={32} height={11} rx={3}
            fill="var(--bg-elevated)" stroke="var(--bg-border)" strokeWidth="0.5" />
          <text
            x={tipX + 16} y={tipY + 7.5}
            fill="var(--text-primary)" fontSize="7" fontWeight="600" textAnchor="middle"
            style={{ fontFamily: 'inherit' }}
          >
            {fmtShort(tipValue)}
          </text>
        </>
      )}

      {/* Full-width invisible overlay for continuous mouse tracking */}
      <rect
        x={Y_W} y={PAD_T} width={chartW} height={chartH + PAD_B}
        fill="transparent"
        style={{ cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setIndicator(null)}
      />
    </svg>
  )
}

// ─── Bar chart (compact — for narrow cards) ───────────────────────────────────

function BarChart({
  points,
  color = 'var(--accent)',
  colorBySign = false,
}: {
  points: { label: string; value: number }[]
  color?: string
  colorBySign?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 300; const H = 82
  const PAD_T = 8; const PAD_B = 16; const PAD_LR = 3
  const chartW = W - PAD_LR * 2
  const chartH = H - PAD_T - PAD_B

  const max = Math.max(...points.map((p) => Math.abs(p.value)), 1)
  const hasNeg = colorBySign && points.some((p) => p.value < 0)
  const halfH = chartH / 2
  const zeroY = hasNeg ? PAD_T + halfH : PAD_T + chartH
  const slot = chartW / points.length
  const barW = Math.max(3, slot * 0.55)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 4 }}>
      {/* Zero / baseline rule */}
      <line x1={PAD_LR} y1={zeroY} x2={W - PAD_LR} y2={zeroY}
        stroke="var(--bg-border)" strokeWidth="0.6" opacity="0.7" />

      {points.map((p, i) => {
        const cx = PAD_LR + slot * i + slot / 2
        const x = cx - barW / 2
        const pct = Math.abs(p.value) / max
        const rawH = Math.max(2, pct * (hasNeg ? halfH - 1 : chartH - 2))
        const isPos = p.value >= 0
        const barY = isPos ? zeroY - rawH : zeroY
        const barColor = colorBySign
          ? (p.value > 0 ? 'var(--success)' : p.value < 0 ? 'var(--danger)' : 'var(--bg-border)')
          : color
        const tipY = isPos ? barY - 13 : barY + rawH + 2

        return (
          <g key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'default' }}
          >
            <rect x={x} y={barY} width={barW} height={rawH} rx={2}
              fill={hover === i ? barColor : `color-mix(in srgb, ${barColor} 70%, transparent)`}
              style={{ transition: 'fill 120ms' }}
            />
            {hover === i && (
              <>
                <rect
                  x={Math.max(PAD_LR, Math.min(cx - 16, W - PAD_LR - 34))}
                  y={tipY} width={34} height={11} rx={3}
                  fill="var(--bg-elevated)" stroke="var(--bg-border)" strokeWidth="0.5"
                />
                <text
                  x={Math.max(PAD_LR, Math.min(cx - 16, W - PAD_LR - 34)) + 17}
                  y={tipY + 7.5}
                  fill="var(--text-primary)" fontSize="7.5" fontWeight="600" textAnchor="middle"
                  style={{ fontFamily: 'inherit' }}
                >
                  {fmtShort(Math.abs(p.value))}
                </text>
              </>
            )}
            <text x={cx} y={H - 2}
              textAnchor="middle" fill="var(--text-tertiary)" fontSize="8.5"
              style={{ fontFamily: 'inherit' }}>
              {p.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Cash position (bank balance card) ───────────────────────────────────────

function CashPosition({
  balance,
  outstanding,
  overdue,
}: {
  balance: number | null
  outstanding: number
  overdue: number
}) {
  const cash = balance ?? 0
  const nonOverdue = Math.max(0, outstanding - overdue)
  const total = Math.max(cash + outstanding, 1)

  const segments = [
    { label: 'Cash in bank', value: cash, color: 'var(--accent)' },
    { label: 'Due (not overdue)', value: nonOverdue, color: '#f59e0b' },
    { label: 'Overdue', value: overdue, color: 'var(--danger)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
      {/* Segmented bar */}
      <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: 'var(--bg-elevated)' }}>
        {segments.map(({ value, color }) => value > 0 && (
          <div key={color} style={{
            width: `${(value / total) * 100}%`,
            background: color,
            transition: 'width 300ms',
          }} />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {segments.map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {value === 0 && balance === null && label === 'Cash in bank' ? '—' : fmtShort(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function Donut({ segments, centre }: {
  segments: { label: string; value: number; color: string }[]
  centre: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const R = 42; const CX = 54; const CY = 54; const CIRC = 2 * Math.PI * R
  let offset = 0
  const arcs = segments.map((s) => {
    const dash = (s.value / total) * CIRC
    const cur = -offset
    offset += dash
    return { ...s, dash, gap: CIRC - dash, offset: cur }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--bg-elevated)" strokeWidth="13" />
        {arcs.map((arc, i) => arc.dash > 0 && (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={arc.color} strokeWidth={hover === i ? 15 : 12}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={arc.offset}
            style={{
              transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px`,
              opacity: hover !== null && hover !== i ? 0.4 : 1,
              transition: 'stroke-width 120ms, opacity 120ms', cursor: 'default',
            }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={CX} y={CY - 4} textAnchor="middle" fill="var(--text-primary)"
          fontSize="15" fontWeight="700" style={{ fontFamily: 'inherit' }}>{centre}</text>
        <text x={CX} y={CY + 12} textAnchor="middle" fill="var(--text-tertiary)"
          fontSize="9" style={{ fontFamily: 'inherit' }}>collected</text>
      </svg>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            opacity: hover !== null && hover !== i ? 0.35 : 1, transition: 'opacity 120ms', cursor: 'default' }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtShort(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Horizontal client bars ───────────────────────────────────────────────────

function ClientBars({ clients }: { clients: { name: string; total: number }[] }) {
  const max = Math.max(...clients.map((c) => c.total), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {clients.map((c, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, marginRight: 8 }}>{c.name}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtShort(c.total)}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(c.total / max) * 100}%`,
              background: i === 0 ? 'var(--accent)' : `color-mix(in srgb, var(--accent) ${85 - i * 13}%, transparent)`,
              borderRadius: 3,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Transactions table ───────────────────────────────────────────────────────

function fmtTxDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const TX_PAGE = 15

function TxTable({ txs }: { txs: XeroTransaction[] }) {
  const [visible, setVisible] = useState(TX_PAGE)
  const totalIn = txs.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0)
  const totalOut = txs.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0)
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

// ─── Create Invoice Modal ─────────────────────────────────────────────────────

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [contactSearch, setContactSearch] = useState('')
  const [contacts, setContacts] = useState<XeroContact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [selectedContact, setSelectedContact] = useState<XeroContact | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14)
    return d.toISOString().slice(0, 10)
  })
  const [sendNow, setSendNow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadContacts = useCallback(async (q: string) => {
    setLoadingContacts(true)
    setContactsError(null)
    try {
      const res = await fetch(`/api/xero/contacts?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) {
        setContactsError(res.status === 503 ? 'Xero not connected — reconnect from the Finance page.' : (data.error ?? 'Failed to load contacts.'))
        setContacts([])
      } else {
        setContacts(data.contacts ?? [])
      }
    } finally {
      setLoadingContacts(false)
    }
  }, [])

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => loadContacts(contactSearch), 350)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [contactSearch, loadContacts])

  // Initial load
  useEffect(() => { loadContacts('') }, [loadContacts])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContact) { setError('Please select a contact.'); return }
    const unitAmount = parseFloat(amount)
    if (!unitAmount || unitAmount <= 0) { setError('Please enter a valid amount.'); return }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/xero/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact.ContactID,
          contactName: selectedContact.Name,
          date: new Date().toISOString().slice(0, 10),
          dueDate,
          lineItems: [{ Description: description || 'Services', UnitAmount: unitAmount, Quantity: 1 }],
          status: sendNow ? 'AUTHORISED' : 'DRAFT',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create invoice.'); return }
      setSuccess(true)
      setTimeout(() => { onCreated(); onClose() }, 1200)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 440, position: 'relative', padding: '24px 24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
            Create Xero Invoice
          </h2>
          <button className="btn-icon" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Check className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--success)' }} />
            <p style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>Invoice created!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Contact */}
            <div>
              <label className="field-label">Bill to (Xero contact)</label>
              {selectedContact ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--accent)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{selectedContact.Name}</span>
                  <button type="button" className="btn-icon" onClick={() => setSelectedContact(null)} style={{ opacity: 0.6 }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                    <input
                      className="field-input"
                      style={{ paddingLeft: 28 }}
                      placeholder="Search contacts…"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                    />
                  </div>
                  {contactsError && (
                    <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{contactsError}</p>
                  )}
                  {!contactsError && (loadingContacts || contacts.length > 0 || contactSearch) && (
                    <div style={{ border: '1px solid var(--bg-border)', borderRadius: 8, marginTop: 4, background: 'var(--bg-card)', maxHeight: 180, overflowY: 'auto', position: 'absolute', width: '100%', zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                      {loadingContacts && <p style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</p>}
                      {!loadingContacts && contacts.length === 0 && (
                        <p style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>No contacts found.</p>
                      )}
                      {contacts.slice(0, 10).map((c) => (
                        <button
                          key={c.ContactID}
                          type="button"
                          onClick={() => { setSelectedContact(c); setContactSearch('') }}
                          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {c.Name}
                          {c.EmailAddress && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>{c.EmailAddress}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="field-label">Description</label>
              <input className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Services rendered" />
            </div>

            {/* Amount */}
            <div>
              <label className="field-label">Amount (excl. GST)</label>
              <input className="field-input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>

            {/* Due date */}
            <div>
              <label className="field-label">Due date</label>
              <input className="field-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            {/* Send now toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div
                onClick={() => setSendNow((v) => !v)}
                style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: sendNow ? 'var(--accent)' : 'var(--bg-elevated)',
                  position: 'relative', transition: 'background 150ms', flexShrink: 0,
                  border: '1px solid var(--bg-border)',
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: 'white',
                  position: 'absolute', top: 2, left: sendNow ? 18 : 2, transition: 'left 150ms',
                }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Approve &amp; send now <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>(leave off to save as Draft)</span>
              </span>
            </label>

            {error && <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={submitting} className="btn-primary" style={{ flex: 1 }}>
                {submitting ? 'Creating…' : sendNow ? 'Create & Approve' : 'Create Draft'}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}
      </div>
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
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [invoiceRefresh, setInvoiceRefresh] = useState(0)
  const { label: rangeLabel } = periodRange(period)

  const filtered = useMemo(() => filterTx(transactions, period), [transactions, period])

  // Chart data — all three respond to period filter
  const revenuePoints = useMemo(() => groupByPeriod(transactions, period, 'in'), [transactions, period])
  const netPoints = useMemo(() => groupByPeriod(transactions, period, 'net'), [transactions, period])
  const expPoints = useMemo(() => groupByPeriod(transactions, period, 'out'), [transactions, period])

  // Totals
  const totalIn = filtered.filter((t) => t.type === 'in' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const totalOut = filtered.filter((t) => t.type === 'out' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const netProfit = totalIn - totalOut

  // Top clients
  const topClients = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.filter((t) => t.type === 'in' && t.status === 'PAID').forEach((t) => { map[t.description] = (map[t.description] ?? 0) + t.amount })
    return Object.entries(map).map(([name, total]) => ({ name, total: Math.round(total) })).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [filtered])

  // Invoice health (all time, from summary)
  const paidTotal = Math.round(transactions.filter((t) => t.type === 'in' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0))
  const outstandingTotal = summary.outstanding_invoices_nzd
  const overdueTotal = summary.overdue_invoices_nzd
  const grandTotal = paidTotal + outstandingTotal + overdueTotal || 1
  const collectedPct = `${Math.round((paidTotal / grandTotal) * 100)}%`

  // Key metrics
  const allPaidIn = transactions.filter((t) => t.type === 'in' && t.status === 'PAID')
  const avgInvoice = allPaidIn.length > 0 ? Math.round(allPaidIn.reduce((s, t) => s + t.amount, 0) / allPaidIn.length) : 0

  // Runway = bank balance ÷ avg monthly burn (last 3 completed months)
  const avgMonthlyBurn = useMemo(() => {
    const now = new Date()
    let total = 0; let months = 0
    for (let i = 1; i <= 3; i++) {
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

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ]

  // Retainer invoice day reminder
  const todayDay = new Date().getDate()
  const showRetainerReminder = retainerInvoiceDay != null && todayDay === retainerInvoiceDay

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {showCreateInvoice && (
        <CreateInvoiceModal
          onClose={() => setShowCreateInvoice(false)}
          onCreated={() => setInvoiceRefresh((v) => v + 1)}
        />
      )}

      {/* Retainer invoice reminder banner */}
      {showRetainerReminder && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
            Today is retainer invoice day — time to send retainer invoices.
          </p>
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowCreateInvoice(true)}>
            <Plus className="w-3.5 h-3.5" /> Create Invoice
          </button>
        </div>
      )}

      {/* Header + period filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em', margin: 0 }}>Finance</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Live data from {summary.org_name ?? 'Xero'}.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Create invoice */}
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowCreateInvoice(true)}>
            <Plus className="w-3.5 h-3.5" /> Create Invoice
          </button>
          {/* Reconnect Xero */}
          <a href="/api/auth/xero/start" className="btn-secondary" style={{ fontSize: 12 }}>
            Reconnect Xero
          </a>
          {/* Period buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={period === key ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: 12 }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Date range */}
          <div className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'default' }}>
            <Calendar style={{ width: 13, height: 13, color: 'var(--accent)', flexShrink: 0 }} />
            {rangeLabel}
          </div>
        </div>
      </div>

      {/* Row 1 — wide revenue chart */}
      <Card title="Revenue" metric={fmtBig(Math.round(totalIn))} wide>
        <AreaChart points={revenuePoints} color="var(--accent)" />
      </Card>

      {/* Row 2 — 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Net Profit" metric={fmtBig(Math.round(netProfit))}>
          <BarChart points={netPoints} colorBySign />
        </Card>
        <Card title="Expenses" metric={fmtBig(Math.round(totalOut))}>
          <BarChart points={expPoints} color="var(--danger)" />
        </Card>
        <Card title="Cash Position" metric={summary.bank_balance_nzd == null ? '—' : fmtBig(summary.bank_balance_nzd)}>
          <CashPosition
            balance={summary.bank_balance_nzd}
            outstanding={summary.outstanding_invoices_nzd}
            overdue={summary.overdue_invoices_nzd}
          />
        </Card>
      </div>

      {/* Row 3 — 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Invoice Health">
          <Donut
            centre={collectedPct}
            segments={[
              { label: 'Collected', value: paidTotal, color: 'var(--success)' },
              { label: 'Outstanding', value: outstandingTotal, color: 'var(--accent)' },
              { label: 'Overdue', value: overdueTotal, color: 'var(--danger)' },
            ]}
          />
        </Card>
        <Card title="Top Clients">
          {topClients.length > 0
            ? <ClientBars clients={topClients} />
            : <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No paid invoices in this period.</p>
          }
        </Card>
        <Card title="Key Metrics">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 8px', marginTop: 4 }}>
            {[
              { label: 'Avg Invoice', value: fmtShort(avgInvoice), color: undefined },
              { label: 'Runway', value: runwayMonths != null ? `${runwayMonths}mo` : '—', color: runwayMonths != null && runwayMonths < 3 ? 'var(--danger)' : runwayMonths != null && runwayMonths < 6 ? '#f59e0b' : undefined },
              { label: 'Outstanding', value: fmtShort(outstandingTotal), color: undefined },
              { label: 'Overdue', value: fmtShort(overdueTotal), color: overdueTotal > 0 ? 'var(--danger)' : undefined },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: color ?? 'var(--text-primary)' }}>{value}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Transactions table */}
      <TxTable txs={filtered} />
    </div>
  )
}
