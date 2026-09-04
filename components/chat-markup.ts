// Helpers for the /api/ai/chat stream protocol, shared by every chat surface
// (AiChat widget, dashboard TuiPanel). The stream is plain text with inline
// control markers: [[WORKING]]…[[/WORKING]] around tool execution, [[MUTATED]]
// when state changed (caller should router.refresh()), and
// [[LINK:path|label]] for created-entity buttons.

// Parse [[LINK:path|label]] markers from message content
export function parseLinks(content: string): { text: string; links: { path: string; label: string }[] } {
  const links: { path: string; label: string }[] = []
  const text = content.replace(/\[\[LINK:([^|]+)\|([^\]]+)\]\]/g, (_, path, label) => {
    links.push({ path: path.trim(), label: label.trim() })
    return ''
  }).trim()
  return { text, links }
}

// Strip working markers from display text. Also drops a partial marker at the
// very end of the buffer ("[[WORK") so mid-chunk splits never flash on screen.
export function cleanContent(content: string): string {
  return content
    .replace(/\[\[WORKING\]\]/g, '')
    .replace(/\[\[\/WORKING\]\]/g, '')
    .replace(/\[\[MUTATED\]\]/g, '')
    .replace(/\[\[[^\]]*$/, '')
    .trim()
}

// Check if the message is currently in a working state (tool execution)
export function isWorking(content: string): boolean {
  const lastWorking = content.lastIndexOf('[[WORKING]]')
  const lastDone = content.lastIndexOf('[[/WORKING]]')
  return lastWorking > lastDone
}

// Render a subset of Markdown safely: **bold** and *italic* / _italic_.
// Input is escaped first so no HTML can sneak in.
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
