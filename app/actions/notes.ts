'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'

type NoteKind = 'general' | 'meeting'

export async function createNote(kind: NoteKind = 'general'): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('notes')
    .insert({
      title: kind === 'meeting' ? 'Untitled meeting' : 'Untitled note',
      kind,
      meeting_date: kind === 'meeting' ? new Date().toISOString().slice(0, 10) : null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/notes')
  redirect(`/dashboard/notes?id=${data.id}`)
}

export async function updateNote(
  id: string,
  data: { title: string; body: string; kind: NoteKind; meeting_date: string | null; attendees: string | null; client_id: string | null },
): Promise<{ error?: string; ok?: true }> {
  const title = data.title?.trim() || 'Untitled note'
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('notes')
    .update({
      title,
      body: data.body ?? '',
      kind: data.kind,
      meeting_date: data.kind === 'meeting' ? (data.meeting_date || null) : null,
      attendees: data.kind === 'meeting' ? (data.attendees || null) : null,
      client_id: data.client_id || null,
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/notes')
  if (data.client_id) revalidatePath(`/dashboard/clients/${data.client_id}`)
  return { ok: true }
}

export async function deleteNote(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.from('notes').delete().eq('id', id)
  revalidatePath('/dashboard/notes')
  redirect('/dashboard/notes')
}
