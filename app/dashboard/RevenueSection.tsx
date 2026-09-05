'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import RevenueChart from './RevenueChart'
import MonthlyReport from './MonthlyReport'
import { type ReportData } from './MonthlyReport'

type Point = { label: string; value: number }

const PERIODS = [
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '12 months', value: 12 },
] as const

type PeriodValue = (typeof PERIODS)[number]['value']

export default function RevenueSection({
  allMonthsData,
  revenueThisMonth,
  revenuePrevMonth,
  changePct,
  reportData,
}: {
  allMonthsData: Point[]
  revenueThisMonth: number
  revenuePrevMonth: number
  changePct: number | undefined
  reportData: ReportData
}) {
  const [period, setPeriod] = useState<PeriodValue>(6)
  const [open, setOpen] = useState(false)

  // When the slide-out panel narrows the content column, the chart must
  // CUT months off (keep each month's physical width) instead of
  // compressing. Watch our own width and shrink the month count to fit.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapWidth, setWrapWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWrapWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const PX_PER_MONTH = 105
  const AXIS_W = 50 // y-axis labels + right padding inside the chart
  const fitMonths =
    wrapWidth == null
      ? period
      : Math.max(2, Math.min(period, Math.floor((wrapWidth - AXIS_W) / PX_PER_MONTH) + 1))

  const fmtNZD = (n: number) =>
    n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2 })

  // Slice current and comparison data from the full 12-month array
  const total = allMonthsData.length
  const currentData = allMonthsData.slice(Math.max(0, total - fitMonths))
  const comparisonData =
    period < 12
      ? allMonthsData.slice(Math.max(0, total - fitMonths * 2), Math.max(0, total - fitMonths))
      : undefined

  const selectedLabel = PERIODS.find((p) => p.value === period)?.label ?? '6 months'

  return (
    <div>
      {/* Stats row */}
      {/* Wraps as a whole. With justify-between and no wrap, the controls held
          their width and squeezed the figures into 302px, so two numbers that
          fit side by side in 318px stacked instead. Now the controls drop to
          their own line and the figures get the room. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="legend-dot" style={{ background: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Revenue this month</p>
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span
                className="text-3xl font-semibold tabular-nums"
                style={{ letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1 }}
              >
                {fmtNZD(revenueThisMonth)}
              </span>
              <Delta pct={changePct} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="legend-dot" style={{ background: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Last month</p>
            </div>
            <p
              className="text-3xl font-semibold tabular-nums mt-1.5"
              style={{ letterSpacing: '-0.03em', color: 'var(--text-tertiary)', lineHeight: 1 }}
            >
              {fmtNZD(revenuePrevMonth)}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Period dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="pill-select"
              onClick={() => setOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              Last {selectedLabel} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {open && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                  onClick={() => setOpen(false)}
                />
                <div
                  className="custom-select-menu"
                  style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 140, padding: '4px' }}
                >
                  {PERIODS.map((p) => (
                    <button
                      key={p.value}
                      className="custom-select-option"
                      data-selected={period === p.value ? 'true' : 'false'}
                      onClick={() => { setPeriod(p.value); setOpen(false) }}
                    >
                      Last {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <MonthlyReport data={reportData} />
        </div>
      </div>

      {/* Chart — two lines; wrapper is the width we fit months into */}
      <div ref={wrapRef}>
        <RevenueChart
          data={currentData}
          comparisonData={comparisonData}
          width={wrapWidth ?? undefined}
        />
      </div>
      <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
        {reportData.source}
      </p>
    </div>
  )
}

function Delta({ pct }: { pct: number | undefined }) {
  // No comparison month → show nothing rather than a fabricated percentage.
  if (pct === undefined) return null
  const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10
  if (!pct) return <span className="delta delta-flat">0%</span>
  const cls = pct > 0 ? 'delta-up' : 'delta-down'
  const arrow = pct > 0 ? '↑' : '↓'
  return <span className={`delta ${cls}`}>{arrow} {Math.abs(rounded)}%</span>
}
