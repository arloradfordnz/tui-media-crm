'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'

export async function createEvent(prevState: { error?: string } | undefined, formData: FormData) {
  const title = formData.get('title') as string
  const eventType = formData.get('eventType') as string
  const date = formData.get('date') as string
  const startTime = formData.get('startTime') as string
  const endTime = formData.get('endTime') as string
  const notes = formData.get('notes') as string
  const jobId = formData.get('jobId') as string

  if (!title || !date) return { error: 'Title and date are required.' }

  await db.event.create({
    data: {
      title,
      eventType: eventType || 'personal',
      date: new Date(date),
      startTime: startTime || null,
      endTime: endTime || null,
      notes: notes || null,
      jobId: jobId || null,
    },
  })

  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
  return {}
}

export async function deleteEvent(eventId: string) {
  await db.event.delete({ where: { id: eventId } })
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
}
