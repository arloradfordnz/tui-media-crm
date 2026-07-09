import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPaidInvoiceTotals, fetchXeroContacts } from './xero'

export type LifetimeSyncResult = {
  connected: boolean
  matched: number   // clients matched to a Xero contact with paid invoices
  updated: number   // clients whose lifetime_value actually changed
  unmatched: string[]  // Xero contacts with paid revenue that matched no client
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Sync each client's lifetime_value from paid Xero invoices.
 *
 * A payment is attributed to a client by matching the Xero invoice contact:
 * first by contact email (via the Xero contacts list), then by name
 * (case/whitespace-insensitive). Pass an authed or service-role Supabase
 * client — callers are the dashboard sync action and the daily briefing cron.
 */
export async function syncClientLifetimeValues(supabase: SupabaseClient): Promise<LifetimeSyncResult> {
  const totals = await fetchPaidInvoiceTotals()
  if (!totals) return { connected: false, matched: 0, updated: 0, unmatched: [] }

  // ContactID → email, so clients can match on email even when the CRM name
  // differs from the Xero contact name.
  const contacts = (await fetchXeroContacts()) ?? []
  const emailByContactId = new Map<string, string>()
  for (const c of contacts) {
    if (c.ContactID && c.EmailAddress) emailByContactId.set(c.ContactID, norm(c.EmailAddress))
  }

  const emailIndex = new Map<string, number[]>()
  const nameIndex = new Map<string, number[]>()
  totals.forEach((t, i) => {
    const email = t.contactId ? emailByContactId.get(t.contactId) : undefined
    if (email) emailIndex.set(email, [...(emailIndex.get(email) ?? []), i])
    const n = norm(t.name)
    nameIndex.set(n, [...(nameIndex.get(n) ?? []), i])
  })

  const { data: clients } = await supabase.from('clients').select('id, name, email, lifetime_value')
  if (!clients) return { connected: true, matched: 0, updated: 0, unmatched: totals.map((t) => t.name) }

  const claimed = new Set<number>()
  let matched = 0
  let updated = 0
  for (const client of clients) {
    const emailHits = client.email ? emailIndex.get(norm(client.email)) : undefined
    const nameHits = nameIndex.get(norm(client.name))
    const indices = [...new Set([...(emailHits ?? []), ...(nameHits ?? [])])]
    if (indices.length === 0) continue
    indices.forEach((i) => claimed.add(i))
    matched++
    const total = indices.reduce((sum, i) => sum + totals[i].total, 0)
    const rounded = Math.round(total * 100) / 100
    if (Number(client.lifetime_value ?? 0) !== rounded) {
      const { error } = await supabase.from('clients').update({ lifetime_value: rounded }).eq('id', client.id)
      if (!error) updated++
    }
  }

  const unmatched = [...new Set(totals.filter((_, i) => !claimed.has(i)).map((t) => t.name))]
  return { connected: true, matched, updated, unmatched }
}
