'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'

async function revalidateJob(jobId: string) {
  revalidatePath(`/dashboard/jobs/${jobId}`)
  revalidatePath('/dashboard/jobs')
  revalidatePath('/dashboard')
}

export async function startTimer(jobId: string, description: string, category: string) {
  const supabase = await createServerSupabaseClient()

  // Stop any running timer on this job first (one active at a time per job).
  const { data: running } = await supabase
    .from('time_entries')
    .select('id, started_at')
    .eq('job_id', jobId)
    .is('ended_at', null)

  if (running && running.length > 0) {
    const now = Date.now()
    for (const r of running) {
      const dur = Math.max(0, Math.round((now - new Date(r.started_at).getTime()) / 1000))
      await supabase.from('time_entries').update({ ended_at: new Date(now).toISOString(), duration_seconds: dur }).eq('id', r.id)
    }
  }

  await supabase.from('time_entries').insert({
    job_id: jobId,
    description: description || null,
    category: category || 'general',
    started_at: new Date().toISOString(),
    billable: true,
  })

  await supabase.from('activities').insert({ action: 'timer_started', details: description ? `Timer started: ${description}` : 'Timer started', job_id: jobId })

  await revalidateJob(jobId)
}

export async function stopTimer(entryId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: entry } = await supabase.from('time_entries').select('started_at, job_id').eq('id', entryId).single()
  if (!entry) return

  const now = Date.now()
  const dur = Math.max(0, Math.round((now - new Date(entry.started_at).getTime()) / 1000))

  await supabase.from('time_entries').update({ ended_at: new Date(now).toISOString(), duration_seconds: dur }).eq('id', entryId)

  const mins = Math.round(dur / 60)
  await supabase.from('activities').insert({ action: 'timer_stopped', details: `Timer stopped (${mins} min)`, job_id: entry.job_id })

  await revalidateJob(entry.job_id)
}

export async function addManualEntry(prevState: { error?: string } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const description = (formData.get('description') as string) || ''
  const category = (formData.get('category') as string) || 'general'
  const dateStr = formData.get('date') as string
  const hours = parseInt((formData.get('hours') as string) || '0', 10) || 0
  const minutes = parseInt((formData.get('minutes') as string) || '0', 10) || 0
  const billable = formData.get('billable') === 'on'

  const totalSeconds = hours * 3600 + minutes * 60
  if (totalSeconds <= 0) return { error: 'Duration must be greater than zero.' }
  if (!jobId) return { error: 'Missing job.' }

  const started = dateStr ? new Date(dateStr) : new Date()
  const ended = new Date(started.getTime() + totalSeconds * 1000)

  const supabase = await createServerSupabaseClient()
  await supabase.from('time_entries').insert({
    job_id: jobId,
    description: description || null,
    category,
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_seconds: totalSeconds,
    billable,
  })

  await supabase.from('activities').insert({ action: 'time_logged', details: `Logged ${hours}h ${minutes}m${description ? `: ${description}` : ''}`, job_id: jobId })

  await revalidateJob(jobId)
  return {}
}

export async function updateTimeEntry(entryId: string, patch: { description?: string; category?: string; billable?: boolean; hours?: number; minutes?: number }) {
  const supabase = await createServerSupabaseClient()
  const { data: entry } = await supabase.from('time_entries').select('job_id, started_at, ended_at').eq('id', entryId).single()
  if (!entry) return

  const update: Record<string, unknown> = {}
  if (patch.description !== undefined) update.description = patch.description || null
  if (patch.category !== undefined) update.category = patch.category
  if (patch.billable !== undefined) update.billable = patch.billable

  if (patch.hours !== undefined || patch.minutes !== undefined) {
    const totalSeconds = (patch.hours || 0) * 3600 + (patch.minutes || 0) * 60
    if (totalSeconds > 0 && entry.started_at) {
      update.duration_seconds = totalSeconds
      update.ended_at = new Date(new Date(entry.started_at).getTime() + totalSeconds * 1000).toISOString()
    }
  }

  await supabase.from('time_entries').update(update).eq('id', entryId)
  await revalidateJob(entry.job_id)
}

export async function deleteTimeEntry(entryId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: entry } = await supabase.from('time_entries').select('job_id').eq('id', entryId).single()
  if (!entry) return
  await supabase.from('time_entries').delete().eq('id', entryId)
  await revalidateJob(entry.job_id)
}

export async function updateJobHourlyRate(jobId: string, rate: number) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('jobs').update({ hourly_rate: rate }).eq('id', jobId)
  await revalidateJob(jobId)
}
