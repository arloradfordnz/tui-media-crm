// Inline formatting in a document body: **bold**, *italic* and ***both***.
// One parser for everything that reads a body (the editor, the preview, the
// portal and the PDF), so a word looks the same wherever it is shown, and
// one writer for the editor to save what Arlo formatted.
//
// An asterisk only counts as formatting when it has a partner: "2 * 3" or a
// lone "*" stays literal text rather than swallowing the rest of the line.

export type Run = { text: string; bold: boolean; italic: boolean }

// The end of the next run of asterisks at or after `from`: [start, length].
function nextStars(src: string, from: number): [number, number] | null {
  const i = src.indexOf('*', from)
  if (i === -1) return null
  let n = 0
  while (src[i + n] === '*') n++
  return [i, n]
}

// Where the closer for an opener of `want` asterisks sits, or -1.
function findCloser(src: string, from: number, want: number): number {
  let at = from
  for (;;) {
    const run = nextStars(src, at)
    if (!run) return -1
    const [i, n] = run
    if (want === 1) {
      // A single * closes italic; a ** inside it is bold and is skipped.
      if (n === 1 && i > from && src[i - 1] !== ' ') return i
      if (n >= 3) return i + n - 1
    } else if (want === 2) {
      if (n >= 2 && i > from) return i + (n - 2) // **bold *ital*** leaves one * for the italic
    } else if (n >= 3 && i > from) {
      return i
    }
    at = i + n
  }
}

function parse(src: string, bold: boolean, italic: boolean, out: Run[]) {
  let i = 0
  let literal = ''
  const flush = () => { if (literal) { push(out, literal, bold, italic); literal = '' } }
  while (i < src.length) {
    if (src[i] !== '*') { literal += src[i++]; continue }
    let n = 0
    while (src[i + n] === '*') n++
    const want = Math.min(n, 3)
    // No closer, or an empty or space-led opener: it is just asterisks.
    const close = findCloser(src, i + want, want)
    const inner = close === -1 ? '' : src.slice(i + want, close)
    if (close === -1 || !inner || (want === 1 && /^\s/.test(inner))) {
      literal += '*'.repeat(n)
      i += n
      continue
    }
    flush()
    parse(inner, bold || want >= 2, italic || want === 1 || want === 3, out)
    i = close + want
  }
  flush()
}

function push(out: Run[], text: string, bold: boolean, italic: boolean) {
  const last = out[out.length - 1]
  if (last && last.bold === bold && last.italic === italic) last.text += text
  else out.push({ text, bold, italic })
}

export function parseInline(src: string): Run[] {
  const out: Run[] = []
  parse(src, false, false, out)
  return out
}

/** The editor's way back to text: runs to **bold** / *italic* markup, with any
 *  edge spaces kept outside the markers (a marker beside a space is ignored). */
export function runsToMarkdown(runs: Run[]): string {
  return runs.map((r) => {
    if (!r.bold && !r.italic) return r.text
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text)!
    if (!m[2]) return r.text
    const stars = r.bold && r.italic ? '***' : r.bold ? '**' : '*'
    return `${m[1]}${stars}${m[2]}${stars}${m[3]}`
  }).join('')
}

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Safe HTML for a line of body text. */
export function inlineToHtml(src: string): string {
  return parseInline(src).map((r) => {
    let h = escapeHtml(r.text)
    if (r.italic) h = `<em>${h}</em>`
    if (r.bold) h = `<strong>${h}</strong>`
    return h
  }).join('')
}
