'use client'

import { useState } from 'react'

type Point = { label: string; value: number }

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

export default function RevenueChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const vals = data.map((d) => d.value)
  const minVal = Math.min(...vals, 0)
  const maxVal = Math.max(...vals, 1)
  const range = maxVal - minVal || 1

  const W = 600
  const H = 120
  const PAD = 16

  const pts = data.map((d, i) => {
    const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2)
    const y = H - PAD - ((d.value - minVal) / range) * (H - PAD * 2)
    return { x, y, ...d }
  })

  const pathD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  const fillD = pts.length > 1
    ? `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${H} L ${pts[0].x.toFixed(1)} ${H} Z`
    : ''

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Area fill */}
        {fillD && (
          <path d={fillD} fill="url(#revGrad)" opacity={0.35} />
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

        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
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
                  fill="var(--accent)"
                  fontSize="11" fontWeight="600" textAnchor="middle"
                  style={{ fontFamily: 'inherit' }}
                >
                  {fmt(p.value)}
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
  )
}
