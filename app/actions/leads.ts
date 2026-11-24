'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, getAuthUser } from '@/lib/supabase-admin'
import { syncLeads, draftNudge, nzToday } from '@/lib/leads'

// The leads board's buttons. The leads table is admin-only under RLS, and the
// sync and drafts need the service client anyway (kv_cache, IMAP), so every
// action checks the signed-in user first and then uses it.

async function admin() {
  if (!(await getAuthUser())) return null
  return createAdminClient()
}

export async function refreshLeads(): Promise<{ ok: boolean; error?: string; leads?: number }> {
  const db = await admin()
  if (!db) return { ok: false, error: 'Not signed in.' }
  const res = await syncLeads(db, { force: true })
  revalidatePath('/dashboard/leads')
  return res.error ? { ok: false, error: res.error } : { ok: true, leads: res.leads }
}

/** Later: hide it until a date, which then outranks everything the mail says. */
export async function followUpLater(id: string, days: number): Promise<{ ok: boolean }> {
  const db = await admin()
  if (!db) return { ok: false }
  const today = nzToday()
  const on = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
  const { error } = await db.from('leads').update({ follow_up_on: on, status: 'open' }).eq('id', id)
  revalidatePath('/dashboard/leads')
  revalidatePath('/dashboard')
  return { ok: !error }
}

export async function setLeadStatus(id: string, status: 'open' | 'dropped' | 'won'): Promise<{ ok: boolean }> {
  const db = await admin()
  if (!db) return { ok: false }
  const { error } = await db.from('leads').update({ status, ...(status === 'open' ? { follow_up_on: null } : {}) }).eq('id', id)
  revalidatePath('/dashboard/leads')
  revalidatePath('/dashboard')
  return { ok: !error }
}

export async function draftLeadNudge(id: string): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  const db = await admin()
  if (!db) return { ok: false, error: 'Not signed in.' }
  const res = await draftNudge(db, id)
  revalidatePath('/dashboard/leads')
  return res
}

/**
 * Sent it: the next sync sees the email in Sent anyway, but this moves the row
 * on now, so the board doesn't keep asking until the mailbox is read again.
 */
export async function markNudged(id: string): Promise<{ ok: boolean }> {
  const db = await admin()
  if (!db) return { ok: false }
  const now = new Date().toISOString()
  const { data } = await db.from('leads').select('messages_out').eq('id', id).maybeSingle()
  const { error } = await db.from('leads').update({
    last_out_at: now,
    messages_out: (data?.messages_out ?? 0) + 1,
    follow_up_on: null,
    nudge_draft: null,
  }).eq('id', id)
  revalidatePath('/dashboard/leads')
  revalidatePath('/dashboard')
  return { ok: !error }
}
