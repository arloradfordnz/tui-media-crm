'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser } from '@/lib/supabase-admin'

/**
 * Mark a client email on the dashboard as dealt with.
 *
 * Rows normally clear themselves when a reply to that address shows up in the
 * sent folder (lib/client-mail.ts). That misses a reply made by phone, text,
 * in person, or from a different mailbox — which left the row stuck on "Your
 * week" long after the client had been answered. This is the manual way out.
 */
export async function markClientEmailDone(id: string): Promise<{ ok: boolean }> {
  if (!(await getAuthUser())) return { ok: false }
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('client_emails')
    .update({ answered_at: new Date().toISOString() })
    .eq('id', id)
    .is('answered_at', null)
  if (error) return { ok: false }
  revalidatePath('/dashboard')
  return { ok: true }
}
