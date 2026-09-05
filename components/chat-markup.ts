// Render a subset of Markdown safely: **bold** and *italic* / _italic_.
// Input is escaped first so no HTML can sneak in.
//
// The inline stream markers this file used to parse ([[WORKING]], [[MUTATED]],
// [[LINK:…]]) are gone — /api/ai/chat now speaks NDJSON, so control data
// travels as typed events instead of being spliced into the prose. See
// lib/tui/receipts.ts.
export function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>')
}
