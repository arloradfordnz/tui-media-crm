// The document editor's engine: markdown text to editable blocks and back.
//
// A document body is stored as the same plain markdown everything else reads
// (the PDF, the portal, Tui): "# Heading" lines, "### Subheading" lines, and
// paragraphs separated by blank lines, with **bold** and *italic* inside.
// The editor shows that as real headings and bold text, so none of the symbols
// are ever on screen, and writes the markdown back when something changes.
//
// The block rules mirror the PDF's (TuiPdfDocument.renderBody) on purpose: a
// heading line is a block of its own, other lines run together into one
// paragraph until a blank line.
//
// Selections cross the DOM/markdown boundary by planting invisible marker
// characters at the two ends of the selection, so a highlighted range can be
// found again in the text (to send to Tui) and in the rebuilt DOM (to select
// the new wording afterwards).

import { parseInline, runsToMarkdown, type Run } from '@/lib/inline-markdown'

export const MARK_START = ''
export const MARK_END = ''

export type BlockKind = 'h1' | 'h3' | 'p'
export type Block = { kind: BlockKind; text: string }

const PREFIX: Record<BlockKind, string> = { h1: '# ', h3: '### ', p: '' }

export function blocksFromMarkdown(md: string): Block[] {
  const blocks: Block[] = []
  let buffer: string[] = []
  const flush = () => { if (buffer.length) { blocks.push({ kind: 'p', text: buffer.join(' ') }); buffer = [] } }
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const h3 = /^###\s+(.+)/.exec(line)
    const h = /^#{1,2}\s+(.+)/.exec(line)
    if (h3) { flush(); blocks.push({ kind: 'h3', text: h3[1] }); continue }
    if (h) { flush(); blocks.push({ kind: 'h1', text: h[1] }); continue }
    buffer.push(line)
  }
  flush()
  return blocks
}

const TAG: Record<BlockKind, string> = { h1: 'h2', h3: 'h3', p: 'p' }

/** Fills the editor with the document. Marker characters in `md` stay in the
 *  text until `selectMarkers` removes them. */
export function buildDom(root: HTMLElement, md: string) {
  root.replaceChildren()
  for (const block of blocksFromMarkdown(md)) {
    const el = document.createElement(TAG[block.kind])
    for (const run of parseInline(block.text)) {
      let node: Node = document.createTextNode(run.text)
      if (run.italic) { const em = document.createElement('em'); em.append(node); node = em }
      if (run.bold) { const st = document.createElement('strong'); st.append(node); node = st }
      el.append(node)
    }
    if (!el.firstChild) el.append(document.createElement('br'))
    root.append(el)
  }
  // An empty document still needs a line to type into.
  if (!root.firstChild) {
    const p = document.createElement('p')
    p.append(document.createElement('br'))
    root.append(p)
  }
}

/** Finds the marker characters in the DOM, removes them and returns the range
 *  between them (or null when the document had none). */
export function selectMarkers(root: HTMLElement): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let start: { node: Text; at: number } | null = null
  let end: { node: Text; at: number } | null = null
  const hits: { node: Text; at: number; kind: 's' | 'e' }[] = []
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const data = n.data
    for (let i = 0; i < data.length; i++) {
      if (data[i] === MARK_START) hits.push({ node: n, at: i, kind: 's' })
      else if (data[i] === MARK_END) hits.push({ node: n, at: i, kind: 'e' })
    }
  }
  if (!hits.length) return null
  // Remove from the back so earlier offsets stay true, noting each position as
  // it will be once everything before it has gone.
  const removedBefore = new Map<Text, number>()
  for (const h of hits) {
    const gone = removedBefore.get(h.node) ?? 0
    const pos = { node: h.node, at: h.at - gone }
    if (h.kind === 's') start = pos
    else end = pos
    removedBefore.set(h.node, gone + 1)
  }
  for (const h of [...hits].reverse()) h.node.deleteData(h.at, 1)
  if (!start || !end) return null
  const range = document.createRange()
  range.setStart(start.node, start.at)
  range.setEnd(end.node, end.at)
  return range
}

// ── DOM → markdown ───────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'])

const kindOf = (tag: string): BlockKind => (tag === 'H1' || tag === 'H2' ? 'h1' : /^H[3-6]$/.test(tag) ? 'h3' : 'p')

// A range end as a position inside a text node, which is the only place a
// marker can be planted. An end that sits between elements (select-all, a
// triple-click) is moved to the nearest text.
function textPoint(root: Node, container: Node, offset: number, edge: 'start' | 'end'): { node: Text; at: number } | null {
  if (container.nodeType === Node.TEXT_NODE) return { node: container as Text, at: offset }
  const boundary = document.createRange()
  boundary.setStart(container, offset)
  boundary.collapse(true)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let found: Text | null = null
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (edge === 'start') {
      // First text at or after the boundary.
      if (boundary.comparePoint(n, 0) >= 0) { found = n; break }
    } else if (boundary.comparePoint(n, n.data.length) <= 0) {
      // Last text at or before the boundary.
      found = n
    }
  }
  if (!found) return null
  return { node: found, at: edge === 'start' ? 0 : found.data.length }
}

/** The editor's text as markdown. With a range, also where that range falls in
 *  the markdown, so it can be sent to Tui. */
export function serialize(root: HTMLElement, range?: Range | null): { md: string; start: number; end: number } {
  const marks = new Map<Text, { at: number; ch: string }[]>()
  if (range && !range.collapsed) {
    const s = textPoint(root, range.startContainer, range.startOffset, 'start')
    const e = textPoint(root, range.endContainer, range.endOffset, 'end')
    if (s) marks.set(s.node, [...(marks.get(s.node) ?? []), { at: s.at, ch: MARK_START }])
    if (e) marks.set(e.node, [...(marks.get(e.node) ?? []), { at: e.at, ch: MARK_END }])
  }

  const blocks: Block[] = []
  let kind: BlockKind = 'p'
  let runs: Run[] = []
  const endBlock = () => {
    const text = runsToMarkdown(runs).replace(/ /g, ' ').replace(/[ \t\r\n]+/g, ' ').trim()
    if (text.replace(new RegExp(`[${MARK_START}${MARK_END}]`, 'g'), '')) blocks.push({ kind, text })
    runs = []
  }

  const walk = (node: Node, bold: boolean, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text
      let text = t.data
      const planted = marks.get(t)
      if (planted) {
        // Later positions first, so earlier ones keep their offsets.
        for (const m of [...planted].sort((a, b) => b.at - a.at)) text = text.slice(0, m.at) + m.ch + text.slice(m.at)
      }
      if (text) runs.push({ text, bold, italic })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') { runs.push({ text: ' ', bold: false, italic: false }); return }
    const style = el.style
    const b = bold || el.tagName === 'B' || el.tagName === 'STRONG' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600
    const i = italic || el.tagName === 'I' || el.tagName === 'EM' || style.fontStyle === 'italic'
    if (BLOCK_TAGS.has(el.tagName)) {
      endBlock()
      kind = kindOf(el.tagName)
      for (const c of Array.from(el.childNodes)) walk(c, b, i)
      endBlock()
      kind = 'p'
      return
    }
    for (const c of Array.from(el.childNodes)) walk(c, b, i)
  }
  for (const c of Array.from(root.childNodes)) walk(c, false, false)
  endBlock()

  const withMarks = blocks.map((bl) => PREFIX[bl.kind] + bl.text).join('\n\n')
  const s = withMarks.indexOf(MARK_START)
  const e = withMarks.indexOf(MARK_END)
  const md = withMarks.replace(new RegExp(`[${MARK_START}${MARK_END}]`, 'g'), '')
  // Each marker was one character in front of the other, so the end shifts by
  // one when the start came first.
  return { md, start: s === -1 ? -1 : s, end: e === -1 ? -1 : e - (s !== -1 && s < e ? 1 : 0) }
}

/** `md` with the marker characters planted at the two offsets. */
export function withMarkers(md: string, start: number, end: number): string {
  return md.slice(0, start) + MARK_START + md.slice(start, end) + MARK_END + md.slice(end)
}
