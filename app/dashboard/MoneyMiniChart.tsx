'use client'

import { useCallback, useRef, useState } from 'react'
import RevenueChart from './RevenueChart'

type Point = { label: string; value: number }

const fmtBig = (n: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n)

/**
 * The dashboard's money graph: the three figures, and the chart under them.
 *
 * Two things this fixes about the first version.
 *
 * **Size.** RevenueChart draws into a fixed 720-wide viewBox and was then laid
 * out at `width: 100%`, so in a 400px column the browser scaled the whole SVG
 * to about 55% — and scaled every 12px axis label, every dot and the hover
 * pill down with it. Nothing was wrong with the chart; it was being rendered
 * at a size nothing in it was designed for. Measuring the container and
 * passing the width through means the SVG is drawn at the size it is
 * displayed, 1:1, so text stays text-sized. When the column is too narrow for
 * every month, months are CUT from the left rather than squeezed — the same
 * trade the Finance chart makes, because four readable months beat six
 * illegible ones.
 *
 * **The figures click.** In and Out isolate their own line, exactly as they do
 * on Finance. Two figures that look identical to the ones on another page but
 * do nothing when pressed is worse than not having them, and the whole reason
 * to isolate a line is to read it against the other — so the other is dimmed,
 * never hidden. Net is not a line on the chart, so it is not a button.
 */
export default function MoneyMiniChart({
  inData,
  outData,
  net,
}: {
  inData: Point[]
  outData: Point[]
  net: number
}) {
  // A callback ref, not an effect. See MoneyChart for the incident — an effect
  // rebuilt the observer on every render and the pending callback was
  // disconnected before it could fire, leaving the width at 0.
  const [width, setWidth] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const wrapRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      // A detached or hidden element reports 0; keeping the last real width
      // stops the chart collapsing to its 300px minimum.
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    observerRef.current = ro
  }, [])

  const [focus, setFocus] = useState<'primary' | 'comparison' | null>(null)

  // Tighter than Finance's 96px: this column is narrower, and six months at
  // 60px each still clears the ~340px where the panel starts being usable.
  const PX_PER_POINT = 60
  const AXIS_W = 44
  const fit =
    width == null
      ? inData.length
      : Math.max(2, Math.min(inData.length, Math.floor((width - AXIS_W) / PX_PER_POINT) + 1))

  const shownIn = inData.slice(Math.max(0, inData.length - fit))
  const shownOut = outData.slice(Math.max(0, outData.length - fit))

  const inTotal = inData.reduce((a, p) => a + p.value, 0)
  const outTotal = outData.reduce((a, p) => a + p.value, 0)

  return (
    <div>
      <div className="money-mini-figures">
        <Figure
          label="In"
          value={fmtBig(inTotal)}
          colour="var(--accent)"
          active={focus === 'primary'}
          dimmed={focus === 'comparison'}
          onClick={() => setFocus((f) => (f === 'primary' ? null : 'primary'))}
        />
        <Figure
          label="Out"
          value={fmtBig(outTotal)}
          colour="var(--chart-out)"
          active={focus === 'comparison'}
          dimmed={focus === 'primary'}
          onClick={() => setFocus((f) => (f === 'comparison' ? null : 'comparison'))}
        />
        {/* Not a button: net is the gap between the two lines, not a line, so
            there is nothing for it to isolate. */}
        <div className="money-mini-figure-static">
          <span className="flex items-center gap-2">
            <span className="legend-dot" style={{ background: net < 0 ? 'var(--danger)' : 'var(--success)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Net</span>
          </span>
          <span
            className="block text-xl font-semibold tabular-nums mt-1"
            style={{
              letterSpacing: '-0.02em',
              color: net < 0 ? 'var(--danger)' : 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            {fmtBig(net)}
          </span>
        </div>
      </div>

      <div ref={wrapRef}>
        <RevenueChart
          data={shownIn}
          comparisonData={shownOut}
          comparisonColor="var(--chart-out)"
          focus={focus}
          width={width ?? undefined}
        />
      </div>
    </div>
  )
}

function Figure({
  label, value, colour, active, dimmed, onClick,
}: {
  label: string; value: string; colour: string
  active: boolean; dimmed: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flow-figure${active ? ' is-active' : ''}${dimmed ? ' is-dimmed' : ''}`}
      aria-pressed={active}
      title={active ? 'Show both lines again' : `Show only money ${label.toLowerCase()}`}
    >
      <span className="flex items-center gap-2">
        <span className="legend-dot" style={{ background: colour }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </span>
      <span
        className="block text-xl font-semibold tabular-nums mt-1"
        style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1 }}
      >
        {value}
      </span>
    </button>
  )
}
