'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function createEvent(prevState: { error?: string } | undefined, formData: FormData) {
  const title = formData.get('title') as string
  const eventType = formData.get('eventType') as string
  const date = formData.get('date') as string
  const startTime = formData.get('startTime') as string
  const endTime = formData.get('endTime') as string
  const notes = formData.get('notes') as string
  const jobId = formData.get('jobId') as string

  if (!title || !date) return { error: 'Title and date are required.' }

  const supabase = await createServerSupabaseClient()
  await supabase.from('events').insert({
    title,
    event_type: eventType || 'personal',
    date: new Date(date).toISOString(),
    start_time: startTime || null,
    end_time: endTime || null,
    notes: notes || null,
    job_id: jobId || null,
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
