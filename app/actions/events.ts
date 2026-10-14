'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'

// A shoot only counts toward a retainer month if the event knows whose it is.
// A job always belongs to one client, so picking a job decides the client and
// overrides whatever was picked separately: an event can never point at one
// client's name and another client's job.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveLinks(supabase: any, jobId: string | null | undefined, clientId: string | null | undefined) {
  if (jobId) {
    const { data: job } = await supabase.from('jobs').select('client_id').eq('id', jobId).maybeSingle()
    return { jobId, clientId: (job?.client_id as string | null) ?? (clientId || null) }
  }
  return { jobId: null, clientId: clientId || null }
}

export async function createEvent(prevState: { error?: string } | undefined, formData: FormData) {
  const title = formData.get('title') as string
  const eventType = formData.get('eventType') as string
  const date = formData.get('date') as string
  const startTime = formData.get('startTime') as string
  const endTime = formData.get('endTime') as string
  const notes = formData.get('notes') as string
  const jobId = formData.get('jobId') as string
  const pickedClientId = formData.get('clientId') as string

  if (!title || !date) return { error: 'Title and date are required.' }

  const supabase = await createServerSupabaseClient()

  const { jobId: linkedJobId, clientId } = await resolveLinks(supabase, jobId, pickedClientId)

  await supabase.from('events').insert({
    title,
    event_type: eventType || 'personal',
    date: new Date(date).toISOString(),
    start_time: startTime || null,
    end_time: endTime || null,
    notes: notes || null,
    job_id: linkedJobId,
    client_id: clientId,
  })

  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
  return {}
}

export async function deleteEvent(eventId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('events').delete().eq('id', eventId)
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
}

export async function updateEventLinks(eventId: string, clientId: string, jobId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient()
  const links = await resolveLinks(supabase, jobId, clientId)
  const { error } = await supabase.from('events').update({ job_id: links.jobId, client_id: links.clientId }).eq('id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
  return {}
}
