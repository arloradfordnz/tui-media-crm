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

/**
 * Put a Your week row away. `snooze` hides it for a week; otherwise it is Done,
 * which holds until the thing it is about changes (the key carries a version,
 * see lib/attention.ts). Done on an overdue task ticks the task, and on a
 * client email marks it answered, so the record says what happened too.
 */
export async function putAwayAttention(
  key: string,
  opts: { snooze?: boolean; taskId?: string; emailId?: string } = {}
): Promise<{ ok: boolean }> {
  if (!(await getAuthUser())) return { ok: false }
  const supabase = await createServerSupabaseClient()

  if (!opts.snooze && opts.taskId) {
    const { error } = await supabase.from('job_tasks').update({ completed: true }).eq('id', opts.taskId)
    if (error) return { ok: false }
  } else if (!opts.snooze && opts.emailId) {
    const { error } = await supabase.from('client_emails').update({ answered_at: new Date().toISOString() }).eq('id', opts.emailId).is('answered_at', null)
    if (error) return { ok: false }
  } else {
    const until = opts.snooze ? new Date(Date.now() + 7 * 86400000).toISOString() : null
    const { error } = await supabase.from('attention_dismissals').upsert({ key, until }, { onConflict: 'key' })
    if (error) return { ok: false }
  }
  revalidatePath('/dashboard')
  return { ok: true }
}
