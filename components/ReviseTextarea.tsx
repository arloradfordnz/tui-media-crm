'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Sparkles, Undo2, X } from 'lucide-react'
import { measureRange, type RangeBox } from '@/lib/textarea-geometry'

// The document text box with "ask Tui" built in, the way Claude edits a doc:
// select some text and a small bar fades in just under it. Type what should
// change, press Enter, and only that part is rewritten; the new wording comes
// back selected. The browser's own selection is the only highlight.
//
// Feel matters here more than anything, so a few deliberate rules:
// - the bar appears only once a selection is finished (pointer or key up),
//   never mid-drag, and it never takes focus or scrolls the page by itself;
// - it follows the selection with a short glide instead of jumping;
// - it sits above the selection when there is no room below on screen.

type Result = { revised: string; note: string } | { error: string }
type Range = { start: number; end: number }
type Spot = { top: number; left: number; width: number }

const BAR_HEIGHT = 48
const GAP = 8
// The phone tab bar covers the bottom of the screen.
const BOTTOM_INSET = 96

export default function ReviseTextarea({
  value,
  onChange,
  onRevise,
  disabled,
  className,
  rows = 22,
}: {
  value: string
  onChange: (next: string) => void
  /** Rewrites value.slice(start, end) as the instructions say. */
  onRevise: (range: Range, instructions: string) => Promise<Result>
  disabled?: boolean
  className?: string
  rows?: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const pointerDown = useRef(false)
  // Set while the component itself moves the selection, so that is not read
  // back as Arlo making a new one.
  const settingSelection = useRef(false)
  const [sel, setSel] = useState<Range | null>(null)
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<{ note: string; before: string; range: Range } | { error: string } | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const selRef = useRef<Range | null>(null)
  useEffect(() => { selRef.current = sel }, [sel])

  const close = useCallback(() => { setSel(null); setAsk(''); setOutcome(null); setSpot(null) }, [])

  // Read the textarea's selection once it has settled.
  const readSelection = useCallback(() => {
    const el = taRef.current
    if (!el || busy || settingSelection.current || pointerDown.current) return
    if (document.activeElement !== el) return
    const { selectionStart: start, selectionEnd: end } = el
    // The same range read again (a late select event, a key that does not
    // move it) is not a new selection, and must not clear "Done · Undo".
    const current = selRef.current
    if (current && current.start === start && current.end === end) return
    if (end > start && el.value.slice(start, end).trim()) {
      setSel({ start, end })
      setOutcome(null)
    } else {
      close()
    }
  }, [busy, close])

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    const down = () => { pointerDown.current = true }
    // After the pointer lifts the selection is final; read it on the next
    // frame, once the browser has applied it.
    const up = () => { pointerDown.current = false; requestAnimationFrame(readSelection) }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      requestAnimationFrame(readSelection)
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    el.addEventListener('keyup', key)
    el.addEventListener('select', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('keyup', key)
      el.removeEventListener('select', up)
    }
  }, [readSelection, close])

  // Clicking anywhere outside the text box and the bar puts the bar away.
  useEffect(() => {
    if (!sel || busy) return
    const away = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) close() }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [sel, busy, close])

  // Where the bar goes: under the selection, or above it when the screen has
  // no room below. Recomputed on any scroll or resize, a frame at a time.
  const place = useCallback(() => {
    const el = taRef.current
    const wrap = wrapRef.current
    if (!el || !wrap || !sel) { setSpot(null); return }
    const box: RangeBox | null = measureRange(el, sel.start, sel.end)
    if (!box) return
    const outer = el.offsetWidth
    const width = Math.min(380, outer - 16)
    const left = Math.max(8, Math.min(box.startLeft - 4, outer - width - 8))
    const wrapTop = wrap.getBoundingClientRect().top
    const belowTop = box.endBottom + GAP
    const roomBelow = window.innerHeight - BOTTOM_INSET - (wrapTop + belowTop + BAR_HEIGHT)
    const aboveTop = box.startTop - GAP - BAR_HEIGHT
    const top = roomBelow >= 0 || aboveTop < 0 ? belowTop : aboveTop
    // Selection scrolled out of the box: hide rather than float over nothing.
    if (box.endBottom < 0 || box.startTop > el.clientHeight) { setSpot(null); return }
    setSpot({ top, left, width })
  }, [sel])

  useLayoutEffect(() => { place() }, [place, value])
  useEffect(() => {
    if (!sel) return
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place) }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule) }
  }, [sel, place])

  function selectInText(range: Range) {
    const el = taRef.current
    if (!el) return
    settingSelection.current = true
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true })
      el.setSelectionRange(range.start, range.end)
      requestAnimationFrame(() => { settingSelection.current = false })
    })
  }

  async function submit() {
    if (!sel || !ask.trim() || busy) return
    setBusy(true)
    setOutcome(null)
    const before = value
    const range = sel
    const result = await onRevise(range, ask)
    setBusy(false)
    if ('error' in result) { setOutcome({ error: result.error }); return }
    onChange(before.slice(0, range.start) + result.revised + before.slice(range.end))
    const next = { start: range.start, end: range.start + result.revised.length }
    setSel(next)
    setOutcome({ note: result.note || 'Done.', before, range })
    setAsk('')
    selectInText(next)
  }

  function undo() {
    if (!outcome || !('before' in outcome)) return
    const range = outcome.range
    onChange(outcome.before)
    setOutcome(null)
    setSel(range)
    selectInText(range)
  }

  const open = !!sel && !!spot && !disabled

  return (
    <div ref={wrapRef} className="revise-wrap">
      <textarea
        ref={taRef}
        rows={rows}
        value={value}
        onChange={(e) => { onChange(e.target.value); close() }}
        className={className}
        disabled={disabled}
        aria-label="Document text"
      />

      {open && (
        <div
          className="revise-bar"
          style={{ transform: `translate3d(${spot.left}px, ${spot.top}px, 0)`, width: spot.width }}
          role="group"
          aria-label="Ask Tui to change the selected text"
        >
          {outcome && 'note' in outcome ? (
            <div className="revise-row">
              <Sparkles className="revise-spark" />
              <span className="revise-note">{outcome.note}</span>
              <button type="button" className="revise-icon-btn" onClick={undo} aria-label="Undo" title="Undo"><Undo2 className="w-3.5 h-3.5" /></button>
              <button type="button" className="revise-icon-btn" onClick={close} aria-label="Done" title="Done"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <div className={`revise-row${busy ? ' is-busy' : ''}`}>
                <Sparkles className="revise-spark" />
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void submit() }
                    if (e.key === 'Escape') { e.preventDefault(); close(); taRef.current?.focus({ preventScroll: true }) }
                  }}
                  placeholder={busy ? 'Tui is rewriting this…' : 'Ask Tui to change this…'}
                  disabled={busy}
                  className="revise-input"
                  aria-label="What should change"
                />
                <button type="button" className="revise-send" onClick={() => void submit()} disabled={busy || !ask.trim()} aria-label="Revise">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </div>
              {outcome && 'error' in outcome && <p className="revise-error">{outcome.error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
