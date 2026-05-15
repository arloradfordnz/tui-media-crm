'use client'

import { useState } from 'react'

type Point = { label: string; value: number }

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

export default function RevenueChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="flex items-end gap-2 h-36 w-full px-1 pb-1">
      {data.map((d, i) => {
        const pct = d.value / max
        const isHovered = hover === i
        const isEmpty = d.value === 0
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end cursor-default"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {/* Tooltip */}
            <div
              className="text-xs font-semibold px-2 py-0.5 rounded-md transition-opacity duration-100 whitespace-nowrap"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                opacity: isHovered ? 1 : 0,
                border: '1px solid var(--bg-border)',
              }}
            >
              {fmt(d.value)}
            </div>

            {/* Bar */}
            <div
              className="w-full rounded-t-md transition-all duration-150"
              style={{
                height: isEmpty ? '3px' : `${Math.max(pct * 100, 4)}%`,
                background: isHovered
                  ? 'var(--accent)'
                  : isEmpty
                  ? 'var(--bg-elevated)'
                  : 'color-mix(in srgb, var(--accent) 55%, transparent)',
                borderRadius: '6px 6px 3px 3px',
              }}
            />

            {/* Label */}
            <span className="text-[11px]" style={{ color: isHovered ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
