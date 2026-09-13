'use client'

import { useCallback, useRef, useState } from 'react'
import RevenueChart from './RevenueChart'

type Point = { label: string; value: number }

/**
 * RevenueChart at its true size inside the dashboard's narrow right column.
 *
 * The chart draws into a fixed 720-wide viewBox and is then laid out at
 * `width: 100%`, so in a 400px column the browser scaled the whole SVG to
 * about 55% — and scaled every 12px axis label, every 3px dot and the hover
 * pill down with it. Nothing was wrong with the chart; it was being rendered
 * at a size nothing in it was designed for.
 *
 * Measuring the container and passing the width through means the SVG is
 * drawn at the size it is displayed, 1:1, so text stays text-sized. When the
 * column is too narrow for every month, months are CUT from the left rather
 * than squeezed — the same trade the Finance chart makes, for the same reason:
 * four readable months beat six illegible ones.
 */
export default function MoneyMiniChart({ inData, outData }: { inData: Point[]; outData: Point[] }) {
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

  return (
    <div ref={wrapRef}>
      <RevenueChart
        data={shownIn}
        comparisonData={shownOut}
        comparisonColor="var(--chart-out)"
        width={width ?? undefined}
      />
    </div>
  )
}
