'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Sparkles, Undo2, X } from 'lucide-react'
import { measureRange, mirrorStyle, type RangeBox } from '@/lib/textarea-geometry'

// The document text box with "ask Tui" built in, the way Claude edits a doc:
// highlight some text and a small bar appears right under it. Type what should
// change, press Enter, and only the highlighted part is rewritten. Nothing
// else is printed about the selection, because the highlight already says it.
//
// A textarea greys out its selection the moment focus moves into the bar, so
// the highlight is drawn separately: a transparent copy of the text sits over
// the textarea with a soft <mark> on the range.

type Result = { revised: string; note: string } | { error: string }
type Range = { start: number; end: number }

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
  const taRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<Range | null>(null)
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [outcome, setOutcome] = useState<{ note: string; before: string } | { error: string } | null>(null)
  const [geo, setGeo] = useState<{ box: RangeBox; style: Partial<CSSStyleDeclaration>; width: number; height: number } | null>(null)

  const close = useCallback(() => { setSel(null); setAsk(''); setOutcome(null) }, [])

  // A selection made by mouse, touch or keyboard. selectionchange covers all
  // three, and is only read while the text box itself has focus, so moving into
  // the bar (which blurs it) does not throw the selection away.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = () => {
      const el = taRef.current
      if (!el || document.activeElement !== el || busy) return
      const { selectionStart: start, selectionEnd: end } = el
      if (end > start && el.value.slice(start, end).trim()) {
        setSel((prev) => (prev && prev.start === start && prev.end === end ? prev : { start, end }))
        setOutcome(null)
      } else {
        setSel(null)
        setOutcome(null)
      }
    }
    const onChange = () => { clearTimeout(timer); timer = setTimeout(read, 180) }
    // Browsers differ on whether a selection inside a textarea reaches the
    // document's selectionchange, so the textarea's own events are read too.
    const el = taRef.current
    const events = ['select', 'mouseup', 'keyup', 'touchend'] as const
    document.addEventListener('selectionchange', onChange)
    for (const name of events) el?.addEventListener(name, onChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', onChange)
      for (const name of events) el?.removeEventListener(name, onChange)
    }
  }, [busy])

  // Where the range is, so the bar and the highlight can be placed.
  const place = useCallback(() => {
    const el = taRef.current
    if (!el || !sel) { setGeo(null); return }
    const box = measureRange(el, sel.start, sel.end)
    if (!box) return
    const cs = getComputedStyle(el)
    setGeo({
      box,
      style: mirrorStyle(el),
      width: el.clientWidth + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth),
      height: el.offsetHeight,
    })
  }, [sel])
  useLayoutEffect(() => { place() }, [place, value, scrollTop])
  useEffect(() => {
    if (!sel) return
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [sel, place])

  // The bar takes focus as soon as it appears, so typing can start at once.
  const barOpen = !!sel && !disabled
  useEffect(() => { if (barOpen && !outcome) inputRef.current?.focus({ preventScroll: true }) }, [barOpen, outcome, sel])
  // On a phone the bar can land behind the bottom tab bar; bring it into view
  // (the scroll-margin in globals.css leaves room for that bar).
  const barShown = barOpen && !!geo
  useEffect(() => { if (barShown) barRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [barShown, sel?.start, sel?.end])

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
    // The new wording stays highlighted so the change is easy to see.
    setSel({ start: range.start, end: range.start + result.revised.length })
    setOutcome({ note: result.note || 'Done.', before })
    setAsk('')
  }

  function undo() {
    if (!outcome || !('before' in outcome)) return
    onChange(outcome.before)
    close()
  }

  const box = geo?.box
  // Under the highlight, or above it when there is no room below.
  const barWidth = Math.min(360, (geo?.width ?? 360) - 16)
  const below = box ? box.endBottom + 8 : 0
  const fitsBelow = !geo || !box || below + 52 < geo.height
  const top = box ? (fitsBelow ? below : Math.max(8, box.startTop - 52 - 8)) : 0
  const left = box && geo ? Math.max(8, Math.min(box.startLeft, geo.width - barWidth - 8)) : 8
  const visible = box && top > -40 && top < (geo?.height ?? 0)

  return (
    <div className="revise-wrap">
      <textarea
        ref={taRef}
        rows={rows}
        value={value}
        onChange={(e) => { onChange(e.target.value); close() }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={(e) => { if (e.key === 'Escape') close() }}
        className={className}
        disabled={disabled}
        aria-label="Document text"
      />

      {geo && sel && (
        <div className="revise-mark" aria-hidden="true">
          <div style={{ ...geo.style, position: 'absolute', top: 0, left: 0, color: 'transparent', transform: `translateY(${-scrollTop}px)`, width: geo.width, pointerEvents: 'none' } as React.CSSProperties}>
            {value.slice(0, sel.start)}<mark>{value.slice(sel.start, sel.end)}</mark>{value.slice(sel.end)}
          </div>
        </div>
      )}

      {barOpen && geo && visible && (
        <div ref={barRef} className="revise-bar" style={{ top, left, width: barWidth }} role="group" aria-label="Revise the highlighted text with Tui">
          {outcome && 'note' in outcome ? (
            <div className="revise-row">
              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
              <span className="revise-note">{outcome.note}</span>
              <button type="button" className="revise-icon-btn" onClick={undo} aria-label="Undo"><Undo2 className="w-3.5 h-3.5" /></button>
              <button type="button" className="revise-icon-btn" onClick={close} aria-label="Done"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <div className="revise-row">
                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                <input
                  ref={inputRef}
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void submit() }
                    if (e.key === 'Escape') { e.preventDefault(); close(); taRef.current?.focus() }
                  }}
                  placeholder={busy ? 'Revising…' : 'Ask Tui to change this…'}
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
