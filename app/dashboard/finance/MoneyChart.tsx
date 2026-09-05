'use client'

import { useEffect, useRef, useState } from 'react'
import { Table2, LineChart } from 'lucide-react'
import RevenueChart from '../RevenueChart'

type Point = { label: string; value: number }

// The Finance chart, built on the same component the dashboard used before it
// moved to Insights — smoothed line, gradient fill, hover crosshair with a
// value pill, month labels underneath.
//
// It carries two real series rather than a period comparison, so the second
// line gets its own colour instead of the muted dashed treatment that means
// "last time". Money in against money out is the whole story of a loss.
export default function MoneyChart({
  inData,
  outData,
  inTotal,
  outTotal,
  inDelta,
  outDelta,
  caption,
  control,
}: {
  inData: Point[]
  outData: Point[]
  inTotal: string
  outTotal: string
  inDelta?: number
  outDelta?: number
  caption: string
  control: React.ReactNode
}) {
  // When the content column narrows, the chart CUTS months rather than
  // compressing them — each month keeps its physical width, so the labels
  // never shrink to unreadable. This is the fix for the one complaint about
  // this chart: it was the unmeasured case that scaled the SVG down.
  const [asTable, setAsTable] = useState(false)
  // Click a figure to read its line on its own. Clicking it again, or the
  // other one, releases it.
  const [focus, setFocus] = useState<'primary' | 'comparison' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapWidth, setWrapWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWrapWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const PX_PER_POINT = 96
  const AXIS_W = 56
  const fit =
    wrapWidth == null
      ? inData.length
      : Math.max(2, Math.min(inData.length, Math.floor((wrapWidth - AXIS_W) / PX_PER_POINT) + 1))

  const shownIn = inData.slice(Math.max(0, inData.length - fit))
  const shownOut = outData.slice(Math.max(0, outData.length - fit))

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Figure
            label="Money in" value={inTotal} colour="var(--accent)" delta={inDelta}
            active={focus === 'primary'} dimmed={focus === 'comparison'}
            onClick={() => setFocus((f) => (f === 'primary' ? null : 'primary'))}
          />
          <Figure
            label="Money out" value={outTotal} colour="var(--chart-out)" delta={outDelta} goodWhenUp={false}
            active={focus === 'comparison'} dimmed={focus === 'primary'}
            onClick={() => setFocus((f) => (f === 'comparison' ? null : 'comparison'))}
          />
        </div>
        <div className="flex items-center gap-2">
          {control}
          {/* A plain secondary button at the same size as everything else on
              the page. It was a btn-ghost with an inline font-size override,
              which made it the only button on Finance with its own geometry. */}
          <button
            className="btn-secondary btn-sm"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
          >
            {asTable
              ? <><LineChart className="w-4 h-4" /> Chart</>
              : <><Table2 className="w-4 h-4" /> Table</>}
          </button>
        </div>
      </div>

      {asTable ? (
        // Full range, not the fitted slice. Months are cut from the CHART so
        // the labels keep their size; a table has no such constraint, and
        // silently dropping rows from it would just be losing data.
        <MonthTable inData={inData} outData={outData} />
      ) : (
        <div ref={wrapRef}>
          <RevenueChart
            data={shownIn}
            comparisonData={shownOut}
            comparisonColor="var(--chart-out)"
            focus={focus}
            width={wrapWidth ?? undefined}
          />
        </div>
      )}

      <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>{caption}</p>
    </div>
  )
}

function Figure({
  label, value, colour, delta, goodWhenUp = true, active, dimmed, onClick,
}: {
  label: string; value: string; colour: string; delta?: number
  goodWhenUp?: boolean; active: boolean; dimmed: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flow-figure${active ? ' is-active' : ''}${dimmed ? ' is-dimmed' : ''}`}
      aria-pressed={active}
      title={active ? `Show both series again` : `Show only ${label.toLowerCase()}`}
    >
      <span className="flex items-center gap-2">
        <span className="legend-dot" style={{ background: colour }} />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </span>
      <span className="flex items-baseline gap-2 mt-1.5">
        <span
          className="text-3xl font-semibold tabular-nums"
          style={{ letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1 }}
        >
          {value}
        </span>
        <Delta pct={delta} goodWhenUp={goodWhenUp} />
      </span>
    </button>
  )
}

function Delta({ pct, goodWhenUp }: { pct: number | undefined; goodWhenUp: boolean }) {
  // No comparison period → show nothing rather than a fabricated percentage.
  if (pct === undefined) return null
  if (!pct) return <span className="delta delta-flat">0%</span>
  const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10
  // Red and green mean worse and better, not down and up: spending more is
  // not an improvement.
  const good = (pct > 0) === goodWhenUp
  return (
    <span className={`delta ${good ? 'delta-up' : 'delta-down'}`}>
      {pct > 0 ? '↑' : '↓'} {Math.abs(rounded)}%
    </span>
  )
}

// The chart's table twin — every value the hover pill shows, reachable without
// a pointer, and the only place the per-month net is written down.
function MonthTable({ inData, outData }: { inData: Point[]; outData: Point[] }) {
  const money = (n: number) =>
    n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="money-table">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">In</th>
            <th className="num">Out</th>
            <th className="num">Net</th>
          </tr>
        </thead>
        <tbody>
          {inData.map((p, i) => {
            const out = outData[i]?.value ?? 0
            const net = p.value - out
            return (
              <tr key={p.label + i}>
                <td>{p.label}</td>
                <td className="num">{money(p.value)}</td>
                <td className="num">{money(out)}</td>
                <td className="num" style={{ color: net < 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {money(net)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
