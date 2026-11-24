'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, getAuthUser } from '@/lib/supabase-admin'
import { writeShotList } from '@/lib/shoot-pack'

export async function makeShotList(eventId: string): Promise<{ ok: true; shotList: string } | { ok: false; error: string }> {
  if (!(await getAuthUser())) return { ok: false, error: 'Not signed in.' }
  const db = createAdminClient()
  if (!db) return { ok: false, error: 'Not configured.' }
  const res = await writeShotList(db, eventId)
  revalidatePath(`/dashboard/shoots/${eventId}`)
  return res
}

/** Hand edits to the shot list, saved as typed. */
export async function saveShotList(eventId: string, text: string): Promise<{ ok: boolean }> {
  if (!(await getAuthUser())) return { ok: false }
  const db = createAdminClient()
  if (!db) return { ok: false }
  const { error } = await db.from('events').update({ shot_list: text.trim() || null, shot_list_at: new Date().toISOString() }).eq('id', eventId)
  revalidatePath(`/dashboard/shoots/${eventId}`)
  return { ok: !error }
}
