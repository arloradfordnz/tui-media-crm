import type { SupabaseClient } from '@supabase/supabase-js'

// Document helpers shared by the dashboard and Tui. The saved contract
// template that used to live here is gone: contracts are drafted per project
// by lib/contract-drafting.ts. The document_templates table is left in place
// (unused) so no data is dropped.

/** Next sequential "#101"-style document number, read off the saved documents. */
export async function nextDocumentNumber(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from('documents').select('content')
  let max = 99
  for (const row of data ?? []) {
    if (!row.content) continue
    try {
      const n = JSON.parse(row.content as string)?.form?.documentNumber
      const m = typeof n === 'string' ? n.match(/^#(\d+)$/) : null
      if (m) max = Math.max(max, parseInt(m[1], 10))
    } catch { /* not JSON, skip */ }
  }
  return `#${max + 1}`
}

/** Any [square bracket] blanks still left in a body. */
export function unfilledPlaceholders(body: string): string[] {
  return [...new Set(body.match(/\[[^\]\n]+\]/g) ?? [])]
}
