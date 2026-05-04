'use client'

import { useId, useState } from 'react'

type Point = { label: string; value: number }

export default function RevenueChart({ data }: { data: Point[] }) {
  const gradId = useId()
  const lineId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const w = 600
  const h = 200
  const pad = { top: 16, right: 16, bottom: 28, left: 16 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const max = Math.max(...data.map((d) => d.value), 1)
  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW

  const points = data.map((d, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + chartH - (d.value / max) * chartH,
    ...d,
  }))

  // Smooth line via cubic bezier
  const line = points.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = arr[i - 1]
    const cp1x = prev.x + (p.x - prev.x) / 2
    const cp2x = prev.x + (p.x - prev.x) / 2
    return `${acc} C ${cp1x} ${prev.y}, ${cp2x} ${p.y}, ${p.x} ${p.y}`
  }, '')

  const area = `${line} L ${points[points.length - 1].x} ${pad.top + chartH} L ${points[0].x} ${pad.top + chartH} Z`

  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7790ed" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#7790ed" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={lineId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#7790ed" />
            <stop offset="100%" stopColor="#7790ed" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={pad.left}
            x2={pad.left + chartW}
            y1={pad.top + chartH * t}
            y2={pad.top + chartH * t}
            stroke="var(--bg-border)"
            strokeWidth="1"
            strokeDasharray="3 5"
            opacity="0.5"
          />
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={`url(#${lineId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover hit areas + dots */}
        {points.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - stepX / 2}
              y={0}
              width={stepX}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 6 : 3.5}
              fill="#fff"
              stroke="#7790ed"
              strokeWidth="2.5"
              style={{ transition: 'r 120ms ease', pointerEvents: 'none' }}
            />
            <text
              x={p.x}
              y={h - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-tertiary)"
              fontFamily="Poppins, sans-serif"
            >
              {p.label}
            </text>
          </g>
        ))}

        {/* Tooltip */}
        {hover !== null && (
          <g style={{ pointerEvents: 'none' }}>
            <rect
              x={Math.min(Math.max(points[hover].x - 42, 4), w - 88)}
              y={Math.max(points[hover].y - 44, 4)}
              width="84"
              height="34"
              rx="10"
              fill="var(--bg-elevated)"
              stroke="var(--bg-border)"
            />
            <text
              x={Math.min(Math.max(points[hover].x, 46), w - 46)}
              y={Math.max(points[hover].y - 28, 20)}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-tertiary)"
              fontFamily="Poppins, sans-serif"
            >
              {points[hover].label}
            </text>
            <text
              x={Math.min(Math.max(points[hover].x, 46), w - 46)}
              y={Math.max(points[hover].y - 14, 34)}
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="var(--text-primary)"
              fontFamily="Poppins, sans-serif"
            >
              {fmt(points[hover].value)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
