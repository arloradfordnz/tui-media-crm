'use client'

import { useState, useRef, useId } from 'react'

type Point = { label: string; value: number }

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

export default function RevenueChart({
  data,
  comparisonData,
  comparisonColor,
  focus,
  width,
}: {
  data: Point[]
  comparisonData?: Point[]
  /** Dim the other line so one trend can be read on its own. */
  focus?: 'primary' | 'comparison' | null
  /** Colour for the second line. Defaults to the muted dashed treatment that
   *  means "the period before this one". Pass a real colour when the second
   *  line is a series in its own right — money out, say — rather than a
   *  comparison, so it does not read as history. */
  comparisonColor?: string
  /** Measured container width in px. When set, the chart renders 1:1
   *  (no scaling) so narrowing the container never shrinks it — the
   *  parent cuts months instead. */
  width?: number
}) {
  const [indicator, setIndicator] = useState<{ x: number; y: number; nearestIdx: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = useId().replace(/:/g, '')
  const gradId = `rg${uid}`
  const gradCompId = `rgc${uid}`
  const clipId = `rc${uid}`

  // Focus dims the other line rather than hiding it: the point of looking at
  // one trend is usually to see it against the other.
  const dim = 0.16
  const mainOpacity = focus === 'comparison' ? dim : 1
  const compOpacity = focus === 'primary' ? dim : 1

  const allValues = [
    ...data.map((p) => p.value),
    ...(comparisonData ?? []).map((p) => p.value),
  ]
  const max = Math.max(...allValues.map((v) => Math.max(0, v)), 1)

  const W = Math.max(300, Math.round(width ?? 720))
  const H = 240
  const Y_W = 44
  const PAD_R = 12
  const PAD_T = 14
  const PAD_B = 24
  const chartW = W - Y_W - PAD_R
  const chartH = H - PAD_T - PAD_B
  const fillBottom = PAD_T + chartH

  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const frac = i / 3
    return { y: PAD_T + chartH - frac * chartH, val: frac * max }
  })

  const xs = data.map((_, i) => Y_W + (i / Math.max(data.length - 1, 1)) * chartW)
  const ys = data.map((p) => {
    const v = Math.max(0, p.value)
    return PAD_T + chartH - (v / max) * chartH
  })

  // Comparison line — aligned to same x positions as main data
  const cxs = comparisonData
    ? comparisonData.map((_, i) => Y_W + (i / Math.max(comparisonData.length - 1, 1)) * chartW)
    : []
  const cys = comparisonData
    ? comparisonData.map((p) => {
        const v = Math.max(0, p.value)
        return PAD_T + chartH - (v / max) * chartH
      })
    : []

  const clampY = (y: number) => Math.max(PAD_T, Math.min(fillBottom, y))

  function smooth(pts: number[][]): string {
    if (pts.length < 2) return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
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
  const compPath = cxs.length > 1 ? smooth(cxs.map((x, i) => [x, cys[i]])) : null

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

    let segIdx = xs.length - 2
    for (let i = 0; i < xs.length - 1; i++) {
      if (clamped <= xs[i + 1]) { segIdx = i; break }
    }

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

  const tipValue = indicator != null ? data[indicator.nearestIdx]?.value ?? 0 : 0
  const tipX = indicator ? Math.max(Y_W + 2, Math.min(indicator.x - 27, W - PAD_R - 56)) : 0
  const tipY = indicator ? Math.max(PAD_T + 2, indicator.y - 27) : 0

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', marginTop: 4, overflow: 'hidden' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          {/* The second line gets the same wash when it is a real series
              rather than a muted period comparison. */}
          {comparisonColor && (
            <linearGradient id={gradCompId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={comparisonColor} stopOpacity="0.10" />
              <stop offset="100%" stopColor={comparisonColor} stopOpacity="0" />
            </linearGradient>
          )}
          <clipPath id={clipId}>
            <rect x={Y_W} y={PAD_T - 1} width={chartW} height={chartH + 2} />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {gridLines.map((gl, i) => (
          <g key={i}>
            <text x={0} y={gl.y + 3} textAnchor="start" fill="var(--text-tertiary)" fontSize="12" style={{ fontFamily: 'inherit' }}>
              {fmt(gl.val)}
            </text>
            <line x1={Y_W} y1={gl.y} x2={W - PAD_R} y2={gl.y} stroke="var(--bg-border)" strokeWidth="0.5" opacity="0.6" />
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {/* Comparison line (previous period) — opacified */}
          {compPath && comparisonColor && (
            <path
              d={`${compPath} L${cxs[cxs.length - 1]},${fillBottom} L${cxs[0]},${fillBottom} Z`}
              fill={`url(#${gradCompId})`}
              opacity={compOpacity}
              style={{ transition: 'opacity 160ms ease' }}
            />
          )}
          {compPath && (
            <path
              d={compPath}
              fill="none"
              stroke={comparisonColor ?? 'var(--text-tertiary)'}
              strokeWidth={comparisonColor ? 1.5 : 1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={comparisonColor ? compOpacity : 0.35 * compOpacity}
              strokeDasharray={comparisonColor ? undefined : '4 3'}
              style={{ transition: 'opacity 160ms ease' }}
            />
          )}

          {/* Current period fill + line */}
          <path d={fillPath} fill={`url(#${gradId})`} opacity={mainOpacity} style={{ transition: 'opacity 160ms ease' }} />
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity={mainOpacity} style={{ transition: 'opacity 160ms ease' }} />
        </g>

        {/* X-axis labels */}
        {xs.map((x, i) => (
          <text
            key={i} x={x} y={H - 4} textAnchor="middle"
            fill={indicator?.nearestIdx === i ? 'var(--text-primary)' : 'var(--text-tertiary)'}
            fontSize="12" style={{ fontFamily: 'inherit', transition: 'fill 120ms' }}
          >
            {data[i].label}
          </text>
        ))}

        {/* Persistent dot at current (latest) point */}
        {!indicator && xs.length > 0 && (
          <circle
            cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={4}
            fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth="2"
          />
        )}

        {/* Hover indicator */}
        {indicator && (
          <>
            <line
              x1={indicator.x} y1={PAD_T} x2={indicator.x} y2={fillBottom}
              stroke="var(--text-tertiary)" strokeWidth="0.8" strokeDasharray="3 3"
            />
            <circle cx={indicator.x} cy={indicator.y} r={4.5} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth="2" />
            <rect x={tipX} y={tipY} width={54} height={19} rx={6} fill="var(--accent)" />
            <text
              x={tipX + 27} y={tipY + 13}
              fill="var(--on-accent)" fontSize="10.5" fontWeight="600" textAnchor="middle"
              style={{ fontFamily: 'inherit' }}
            >
              {fmt(tipValue)}
            </text>
          </>
        )}

        {/* Hit area */}
        <rect
          x={Y_W} y={PAD_T} width={chartW} height={chartH + PAD_B}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setIndicator(null)}
        />
      </svg>
    </div>
  )
}
