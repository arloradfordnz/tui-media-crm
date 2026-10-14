// Long-term memory for Tui: standing facts Arlo has told it ("a reel takes
// about an hour to edit") that should outlive the chat thread. Saved by the
// remember/forget tools, edited by hand under Settings → Memory, and put into
// the context of every dashboard and Telegram turn.

export const MEMORY_CATEGORIES = [
  { key: 'workflow', label: 'How Arlo works', hint: 'Edit times, shoot length, turnaround' },
  { key: 'pricing', label: 'Pricing & rates', hint: 'Rates, packages, what he charges' },
  { key: 'client', label: 'Clients', hint: 'Preferences and quirks of specific clients' },
  { key: 'preference', label: 'Preferences', hint: 'How he likes things done' },
  { key: 'business', label: 'Business', hint: 'Gear, location, tools, the business itself' },
] as const

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]['key']

export const MEMORY_CATEGORY_KEYS = MEMORY_CATEGORIES.map((c) => c.key) as MemoryCategory[]

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && (MEMORY_CATEGORY_KEYS as string[]).includes(value)
}

export type Memory = {
  id: string
  category: string
  content: string
  client_id: string | null
  source: string
  created_at: string
  updated_at: string
  clients?: { name: string } | null
}

type Supa = any // eslint-disable-line @typescript-eslint/no-explicit-any

// Small by design, so the cap is a guard, not a page size.
export const MEMORY_LIMIT = 200

export async function listMemories(supabase: Supa): Promise<Memory[]> {
  const { data } = await supabase
    .from('ai_memories')
    .select('id, category, content, client_id, source, created_at, updated_at, clients(name)')
    .order('created_at', { ascending: true })
    .limit(MEMORY_LIMIT)
  return (data ?? []) as Memory[]
}

// One block for the system context. IDs ride along so forget/update_memory
// can name a row without a list round. Empty string when there is nothing, so
// callers can skip the line.
export function formatMemories(memories: Memory[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m) => {
    const who = m.clients?.name ? ` (${m.clients.name})` : ''
    return `- [${m.category}] ${m.content}${who} {id: ${m.id}}`
  })
  return `Things Arlo has told you to remember (treat as true unless he says otherwise; use the id with update_memory or forget):\n${lines.join('\n')}`
}
