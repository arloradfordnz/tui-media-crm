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
 * Matching is tiered so it survives renames on either side:
 *   1. clients.xero_contact_id, if already linked — exact and permanent.
 *   2. Contact email (via the Xero contacts list) matched against client email.
 *   3. Client/contact name, case/whitespace-insensitive.
 * Whenever (2) or (3) resolves a match, we backfill xero_contact_id onto the
 * client so future syncs skip straight to the stable ID.
 *
 * Pass an authed or service-role Supabase client — callers are the dashboard
 * sync action and the daily briefing cron.
 */
export async function syncClientLifetimeValues(supabase: SupabaseClient): Promise<LifetimeSyncResult> {
  const totals = await fetchPaidInvoiceTotals()
  if (!totals) return { connected: false, matched: 0, updated: 0, unmatched: [] }

  const totalsByContactId = new Map(totals.map((t) => [t.contactId, t] as const))

  // ContactID → email, so clients can match on email even when the CRM name
  // differs from the Xero contact name.
  const contacts = (await fetchXeroContacts()) ?? []
  const emailByContactId = new Map<string, string>()
  for (const c of contacts) {
    if (c.ContactID && c.EmailAddress) emailByContactId.set(c.ContactID, norm(c.EmailAddress))
  }

  const emailIndex = new Map<string, string[]>() // normalised email -> contactIds
  const nameIndex = new Map<string, string[]>()  // normalised name -> contactIds
  for (const t of totals) {
    if (!t.contactId) continue
    const email = emailByContactId.get(t.contactId)
    if (email) emailIndex.set(email, [...(emailIndex.get(email) ?? []), t.contactId])
    const n = norm(t.name)
    nameIndex.set(n, [...(nameIndex.get(n) ?? []), t.contactId])
  }

  // '*' keeps this working whether or not migration_xero_contact_id.sql
  // (the xero_contact_id column) has been run yet.
  const { data: clients } = await supabase.from('clients').select('*')
  if (!clients) return { connected: true, matched: 0, updated: 0, unmatched: totals.map((t) => t.name) }
  const hasContactIdColumn = clients.length > 0 && Object.prototype.hasOwnProperty.call(clients[0], 'xero_contact_id')

  const claimed = new Set<string>()
  let matched = 0
  let updated = 0
  for (const client of clients) {
    let contactIds: string[] = []

    const linked = (client as { xero_contact_id?: string | null }).xero_contact_id
    if (linked && totalsByContactId.has(linked)) {
      contactIds = [linked]
    } else {
      const emailHits = client.email ? emailIndex.get(norm(client.email)) : undefined
      const nameHits = nameIndex.get(norm(client.name))
      contactIds = [...new Set([...(emailHits ?? []), ...(nameHits ?? [])])]
    }

    if (contactIds.length === 0) continue
    contactIds.forEach((id) => claimed.add(id))
    matched++

    const total = contactIds.reduce((sum, id) => sum + (totalsByContactId.get(id)?.total ?? 0), 0)
    const rounded = Math.round(total * 100) / 100

    const patch: Record<string, unknown> = {}
    if (Number(client.lifetime_value ?? 0) !== rounded) patch.lifetime_value = rounded
    // First time this client resolves via email/name — pin it to the ID.
    if (hasContactIdColumn && !linked && contactIds.length === 1) patch.xero_contact_id = contactIds[0]

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('clients').update(patch).eq('id', client.id)
      if (!error && patch.lifetime_value !== undefined) updated++
    }
  }

  const unmatched = totals.filter((t) => t.contactId && !claimed.has(t.contactId)).map((t) => t.name)
  return { connected: true, matched, updated, unmatched }
}
