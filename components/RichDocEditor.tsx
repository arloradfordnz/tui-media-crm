'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Bold, Heading1, Heading2, Italic, Sparkles, Undo2, X } from 'lucide-react'
import { buildDom, selectMarkers, serialize, withMarkers } from '@/lib/rich-doc'

// The document editor. The text is shown as the document looks (real headings,
// bold and italic, no # or ** on screen) and is saved as the same plain
// markdown everything else reads (lib/rich-doc.ts).
//
// Select any text and a small bar fades in under it: Bold, Italic, Heading and
// Subheading to format it, and a field to ask Tui to rewrite just that part.
//
// Feel rules, learned the hard way on the plain text box this replaced:
// - the bar appears only once a selection is finished (pointer or key up),
//   never mid-drag, and never takes focus or scrolls the page by itself;
// - it glides to follow the selection instead of jumping;
// - the format buttons act on the selection without stealing focus from the
//   text, so the selection never flickers.

type Result = { revised: string; note: string } | { error: string }
type Range1 = { start: number; end: number }
type Spot = { top: number; left: number; width: number }
type Outcome = { note: string; before: string; beforeMarked: string } | { error: string }

const BAR_WIDTH = 440
const BAR_HEIGHT = 48
const GAP = 8
// The phone tab bar covers the bottom of the screen.
const BOTTOM_INSET = 96

export default function RichDocEditor({
  value,
  onChange,
  onRevise,
  disabled,
  className,
}: {
  /** The document as markdown. */
  value: string
  onChange: (next: string) => void
  /** Rewrites document.slice(range.start, range.end) as the instructions say. */
  onRevise: (document: string, range: Range1, instructions: string) => Promise<Result>
  disabled?: boolean
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerDown = useRef(false)
  // True while the component moves the selection itself, so that is not read
  // back as Arlo making a new one.
  const settingSelection = useRef(false)
  // What the editor last wrote out, so a value that comes back unchanged does
  // not rebuild the text under the caret.
  const emitted = useRef(value)
  const selRef = useRef<Range | null>(null)

  const [sel, setSel] = useState<Range | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [active, setActive] = useState({ bold: false, italic: false, block: 'p' })

  useEffect(() => { selRef.current = sel }, [sel])

  const close = useCallback(() => { setSel(null); setAsk(''); setOutcome(null); setSpot(null) }, [])
  const markEmpty = (md: string) => rootRef.current?.toggleAttribute('data-empty', !md.trim())

  // First paint, and any change that did not come from typing here (Tui's
  // rewrite, an undo, the page loading another document).
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    document.execCommand('defaultParagraphSeparator', false, 'p')
    buildDom(root, value)
    emitted.current = value
    markEmpty(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const root = rootRef.current
    if (!root || value === emitted.current) return
    buildDom(root, value)
    emitted.current = value
    markEmpty(value)
    close()
  }, [value, close])

  function sync() {
    const root = rootRef.current
    if (!root) return
    const { md } = serialize(root)
    markEmpty(md)
    if (md === emitted.current) return
    emitted.current = md
    onChange(md)
  }

  const readActive = useCallback(() => {
    try {
      const block = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '')
      setActive({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), block })
    } catch { /* not supported: buttons just do not show a state */ }
  }, [])

  // Read the selection once it has settled.
  const readSelection = useCallback(() => {
    const root = rootRef.current
    if (!root || busy || pointerDown.current || settingSelection.current) return
    const s = window.getSelection()
    if (!s || s.rangeCount === 0) return
    const r = s.getRangeAt(0)
    // Focus moved into the bar: the selection is still the one in use.
    if (!root.contains(r.commonAncestorContainer)) return
    if (r.collapsed || !r.toString().trim()) { if (selRef.current) close(); return }
    const cur = selRef.current
    // The same range read again must not clear "Done · Undo".
    if (cur && cur.compareBoundaryPoints(Range.START_TO_START, r) === 0 && cur.compareBoundaryPoints(Range.END_TO_END, r) === 0) return
    setSel(r.cloneRange())
    setOutcome(null)
    readActive()
  }, [busy, close, readActive])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const down = () => { pointerDown.current = true }
    // After the pointer lifts the selection is final.
    const up = () => { pointerDown.current = false; requestAnimationFrame(readSelection) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else requestAnimationFrame(readSelection) }
    // Touch selection handles move without pointer events; wait for it to rest.
    const rest = () => { clearTimeout(timer); timer = setTimeout(readSelection, 220) }
    root.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    root.addEventListener('keyup', key)
    document.addEventListener('selectionchange', rest)
    return () => {
      clearTimeout(timer)
      root.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      root.removeEventListener('keyup', key)
      document.removeEventListener('selectionchange', rest)
    }
  }, [readSelection, close])

  // A click anywhere outside the text and the bar puts the bar away.
  useEffect(() => {
    if (!sel || busy) return
    const away = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) close() }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [sel, busy, close])

  // Under the selection, or above it when the screen has no room below.
  const place = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap || !sel) { setSpot(null); return }
    const rects = sel.getClientRects()
    if (!rects.length) { setSpot(null); return }
    const first = rects[0]
    const last = rects[rects.length - 1]
    const w = wrap.getBoundingClientRect()
    const width = Math.min(BAR_WIDTH, w.width - 16)
    const left = Math.max(8, Math.min(first.left - w.left - 4, w.width - width - 8))
    const belowTop = last.bottom - w.top + GAP
    const roomBelow = window.innerHeight - BOTTOM_INSET - (w.top + belowTop + BAR_HEIGHT)
    const aboveTop = first.top - w.top - GAP - BAR_HEIGHT
    setSpot({ left, width, top: roomBelow >= 0 || aboveTop < 0 ? belowTop : aboveTop })
  }, [sel])

  // A frame after the selection or text changes, once the layout has settled.
  useEffect(() => {
    const frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [place, value])
  useEffect(() => {
    if (!sel) return
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place) }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule) }
  }, [sel, place])

  // Puts a range back as the live selection.
  function select(range: Range) {
    const root = rootRef.current
    if (!root) return
    settingSelection.current = true
    root.focus({ preventScroll: true })
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    requestAnimationFrame(() => { settingSelection.current = false })
  }

  function format(run: () => void) {
    if (!sel) return
    select(sel)
    run()
    sync()
    const s = window.getSelection()
    if (s && s.rangeCount) setSel(s.getRangeAt(0).cloneRange())
    readActive()
    requestAnimationFrame(place)
  }
  const toggleBlock = (tag: 'h2' | 'h3') => format(() => {
    const now = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '')
    document.execCommand('formatBlock', false, now === tag ? 'p' : tag)
  })

  // Replaces the whole document, optionally selecting a marked range after.
  function applyDocument(marked: string, clean: string) {
    const root = rootRef.current
    if (!root) return
    buildDom(root, marked)
    emitted.current = clean
    markEmpty(clean)
    onChange(clean)
    const r = selectMarkers(root)
    if (r) { select(r); setSel(r.cloneRange()) } else close()
  }

  async function submit() {
    const root = rootRef.current
    if (!root || !sel || !ask.trim() || busy) return
    const { md, start, end } = serialize(root, sel)
    if (start < 0 || end <= start) { setOutcome({ error: "Couldn't read that selection. Select it again." }); return }
    setBusy(true)
    setOutcome(null)
    const result = await onRevise(md, { start, end }, ask)
    setBusy(false)
    if ('error' in result) { setOutcome({ error: result.error }); return }
    const next = md.slice(0, start) + result.revised + md.slice(end)
    applyDocument(withMarkers(next, start, start + result.revised.length), next)
    setOutcome({ note: result.note || 'Done.', before: md, beforeMarked: withMarkers(md, start, end) })
    setAsk('')
  }

  function undo() {
    if (!outcome || !('before' in outcome)) return
    applyDocument(outcome.beforeMarked, outcome.before)
    setOutcome(null)
  }

  // Plain text only: pasted formatting from elsewhere would bring its own
  // fonts and colours into the document.
  function paste(e: React.ClipboardEvent) {
    e.preventDefault()
    const paragraphs = e.clipboardData.getData('text/plain').replace(/\r/g, '').split(/\n{2,}/)
    paragraphs.forEach((p, i) => {
      if (i > 0) document.execCommand('insertParagraph')
      document.execCommand('insertText', false, p.replace(/\n/g, ' '))
    })
  }

  const open = !!sel && !!spot && !disabled
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div ref={wrapRef} className="revise-wrap">
      <div
        ref={rootRef}
        className={`rich-doc ${className ?? ''}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Document text"
        data-placeholder="Start writing, or select text to format it or ask Tui."
        spellCheck
        onInput={sync}
        onPaste={paste}
      />

      {open && (
        <div
          className="revise-bar"
          style={{ transform: `translate3d(${spot.left}px, ${spot.top}px, 0)`, width: spot.width }}
          role="toolbar"
          aria-label="Format the selected text or ask Tui to change it"
        >
          {outcome && 'note' in outcome ? (
            <div className="revise-row">
              <Sparkles className="revise-spark" />
              <span className="revise-note">{outcome.note}</span>
              <button type="button" className="revise-icon-btn" onMouseDown={keepFocus} onClick={undo} aria-label="Undo" title="Undo"><Undo2 className="w-3.5 h-3.5" /></button>
              <button type="button" className="revise-icon-btn" onMouseDown={keepFocus} onClick={close} aria-label="Done" title="Done"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <div className={`revise-row${busy ? ' is-busy' : ''}`}>
                <div className="revise-fmt" role="group" aria-label="Format">
                  <button type="button" className={`revise-icon-btn${active.bold ? ' is-on' : ''}`} onMouseDown={keepFocus} onClick={() => format(() => document.execCommand('bold'))} aria-label="Bold" aria-pressed={active.bold} title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                  <button type="button" className={`revise-icon-btn${active.italic ? ' is-on' : ''}`} onMouseDown={keepFocus} onClick={() => format(() => document.execCommand('italic'))} aria-label="Italic" aria-pressed={active.italic} title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                  <button type="button" className={`revise-icon-btn${active.block === 'h2' || active.block === 'h1' ? ' is-on' : ''}`} onMouseDown={keepFocus} onClick={() => toggleBlock('h2')} aria-label="Heading" title="Heading"><Heading1 className="w-3.5 h-3.5" /></button>
                  <button type="button" className={`revise-icon-btn${active.block === 'h3' ? ' is-on' : ''}`} onMouseDown={keepFocus} onClick={() => toggleBlock('h3')} aria-label="Subheading" title="Subheading"><Heading2 className="w-3.5 h-3.5" /></button>
                </div>
                <span className="revise-divider" aria-hidden="true" />
                <Sparkles className="revise-spark" />
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void submit() }
                    if (e.key === 'Escape') { e.preventDefault(); close(); rootRef.current?.focus({ preventScroll: true }) }
                  }}
                  placeholder={busy ? 'Tui is rewriting this…' : 'Ask Tui to change this…'}
                  disabled={busy}
                  className="revise-input"
                  aria-label="Ask Tui to change the selected text"
                />
                <button type="button" className="revise-send" onClick={() => void submit()} disabled={busy || !ask.trim()} aria-label="Send to Tui">
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
