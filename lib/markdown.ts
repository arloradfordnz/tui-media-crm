/**
 * Shared, intentionally-tiny markdown renderer used by the portal, the AI
 * assistant chat bubble, and the PDF body. Supports the subset that documents
 * actually use:
 *   # Heading       → <h2>
 *   ## Subheading   → <h3>
 *   ### Small head  → <h4>
 *   **bold**        → <strong>
 *
 * All untrusted input is HTML-escaped before any tags are inserted, so the
 * output is safe to feed into `dangerouslySetInnerHTML`.
 */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Inline-only: escape + bold. Use for short strings that mustn't break across lines. */
export function renderInline(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
}

type DocBodyStyle = {
  h1?: string
  h2?: string
  h3?: string
}

const DEFAULT_STYLE: Required<DocBodyStyle> = {
  h1: 'font-size:20px;font-weight:700;margin:22px 0 8px;color:var(--text-primary);letter-spacing:-0.01em;',
  h2: 'font-size:16px;font-weight:600;margin:18px 0 6px;color:var(--text-primary);',
  h3: 'font-size:14px;font-weight:600;margin:14px 0 4px;color:var(--text-primary);',
}

/**
 * Render multi-line document body markdown to HTML. Headings replace the whole
 * line; everything else is escaped + bold-handled and joined with newlines so
 * the wrapping element can rely on `white-space: pre-wrap` for paragraph breaks.
 */
export function renderDocBody(text: string, style: DocBodyStyle = {}): string {
  const s = { ...DEFAULT_STYLE, ...style }
  const lines = text.split('\n')
  const out: string[] = []
  for (const raw of lines) {
    if (/^### .+/.test(raw)) {
      out.push(`<h4 style="${s.h3}">${renderInline(raw.replace(/^### /, ''))}</h4>`)
    } else if (/^## .+/.test(raw)) {
      out.push(`<h3 style="${s.h2}">${renderInline(raw.replace(/^## /, ''))}</h3>`)
    } else if (/^# .+/.test(raw)) {
      out.push(`<h2 style="${s.h1}">${renderInline(raw.replace(/^# /, ''))}</h2>`)
    } else {
      out.push(renderInline(raw))
    }
  }
  return out.join('\n')
}
