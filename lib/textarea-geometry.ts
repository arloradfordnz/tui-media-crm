// Where a range of text sits inside a <textarea>, in pixels from the
// textarea's top-left corner (scroll already taken off). A textarea does not
// expose this, so the standard trick is used: an invisible div with exactly the
// same box and text styles, laid out with the same text, and markers measured.
// Used by the document editor to float the "ask Tui" box under a highlight and
// to draw the highlight itself while focus is in that box.

// Everything that changes where text wraps or how tall a line is.
export const MIRRORED_PROPS = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
] as const

export function mirrorStyle(el: HTMLTextAreaElement): Partial<CSSStyleDeclaration> {
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const p of MIRRORED_PROPS) out[p] = cs[p] as string
  return { ...out, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'normal' } as Partial<CSSStyleDeclaration>
}

export type RangeBox = { startTop: number; startLeft: number; endBottom: number; endLeft: number; lineHeight: number }

export function measureRange(el: HTMLTextAreaElement, start: number, end: number): RangeBox | null {
  if (typeof document === 'undefined') return null
  const div = document.createElement('div')
  Object.assign(div.style, mirrorStyle(el), {
    position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px',
    overflow: 'hidden', height: 'auto',
    // The textarea's scrollbar takes width away from the text.
    width: `${el.clientWidth + parseFloat(getComputedStyle(el).borderLeftWidth) + parseFloat(getComputedStyle(el).borderRightWidth)}px`,
  })
  const text = el.value
  const a = document.createElement('span')
  const b = document.createElement('span')
  a.textContent = '​'
  b.textContent = '​'
  div.append(text.slice(0, start), a, text.slice(start, end), b, text.slice(end) + '\n')
  document.body.appendChild(div)
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || b.offsetHeight || 20
  const box = {
    startTop: a.offsetTop - el.scrollTop,
    startLeft: a.offsetLeft - el.scrollLeft,
    endBottom: b.offsetTop + lineHeight - el.scrollTop,
    endLeft: b.offsetLeft - el.scrollLeft,
    lineHeight,
  }
  div.remove()
  return box
}
