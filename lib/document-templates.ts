import type { SupabaseClient } from '@supabase/supabase-js'

// The standard Tui Media contract wording. Mirrors the seed row in
// supabase/migrations/20261011_0002_document_templates.sql and is the fallback
// if the row is missing or the table has not been migrated yet. Square
// brackets are blanks to fill per client. No em dashes, no guarantees, no
// retainer: see the voice rules in .claude/skills/tui-contract/SKILL.md.
export const DEFAULT_CONTRACT_BODY = `# Scope of Work
Tui Media will strategise, script, film, edit, and launch and manage [number] video ads for [client]. [One or two plain sentences on what is being made and where it will run.]

# Payment
The project fee is [project fee] (excluding GST), covering the whole project including one month of launching and managing the ads. It is payable [payment schedule]. Ad spend is separate and is paid by the client directly to the ad platform, so nothing is marked up. Tui Media does not guarantee any particular result from the ads.

# Timeline
Filming takes place on [shoot date]. The edited videos are delivered by [delivery date]. The ads then launch and are managed for one month, starting [launch date].

# Ownership & Handover
At the end of the month the client receives everything: the raw footage, the final edited videos, and the ad account itself.

# Cancellation
Either side can cancel before filming by telling the other in writing. Work completed to that point is invoiced. This is a one-off project with no retainer and no lock-in.`

export const CONTRACT_TEMPLATE = 'Contract'

/** The saved contract template, or the built-in default if there isn't one. */
export async function getContractTemplate(supabase: SupabaseClient): Promise<{ body: string; isDefault: boolean; updatedAt: string | null }> {
  const { data } = await supabase
    .from('document_templates')
    .select('body, updated_at')
    .eq('template', CONTRACT_TEMPLATE)
    .maybeSingle()
  if (data?.body && data.body.trim()) return { body: data.body, isDefault: data.body === DEFAULT_CONTRACT_BODY, updatedAt: data.updated_at }
  return { body: DEFAULT_CONTRACT_BODY, isDefault: true, updatedAt: null }
}

export async function saveContractTemplate(supabase: SupabaseClient, body: string): Promise<{ error?: string }> {
  const clean = body.replace(/\r\n/g, '\n').trim()
  if (!clean) return { error: 'The template cannot be empty.' }
  const { error } = await supabase
    .from('document_templates')
    .upsert({ template: CONTRACT_TEMPLATE, body: clean, updated_at: new Date().toISOString() }, { onConflict: 'template' })
  return error ? { error: error.message } : {}
}

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
