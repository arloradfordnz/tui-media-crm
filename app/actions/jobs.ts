'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function createJob(prevState: { error?: string } | undefined, formData: FormData) {
  const name = formData.get('name') as string
  const clientId = formData.get('clientId') as string
  const jobType = formData.get('jobType') as string
  const shootDate = formData.get('shootDate') as string
  const shootLocation = formData.get('shootLocation') as string
  const quoteValue = formData.get('quoteValue') as string
  const tasksJson = formData.get('tasks') as string
  const deliverablesJson = formData.get('deliverables') as string

  if (!name || !clientId) return { error: 'Job name and client are required.' }

  const supabase = await createServerSupabaseClient()

  const { data: job, error } = await supabase.from('jobs').insert({
    name,
    client_id: clientId,
    job_type: jobType || null,
    shoot_date: shootDate ? new Date(shootDate).toISOString() : null,
    shoot_location: shootLocation || null,
    quote_value: quoteValue ? parseFloat(quoteValue) : null,
  }).select('id').single()

  if (error || !job) return { error: error?.message || 'Failed to create job.' }

  if (tasksJson) {
    const tasks = JSON.parse(tasksJson) as { phase: string; title: string }[]
    for (let i = 0; i < tasks.length; i++) {
      await supabase.from('job_tasks').insert({ job_id: job.id, phase: tasks[i].phase, title: tasks[i].title, sort_order: i })
    }
  } else if (jobType) {
    const { data: template } = await supabase
      .from('job_templates')
      .select('id, template_tasks(phase, title, sort_order), template_deliverables(title, description, sort_order)')
      .eq('job_type', jobType)
      .single()

    if (template) {
      for (const t of (template.template_tasks as { phase: string; title: string; sort_order: number }[])) {
        await supabase.from('job_tasks').insert({ job_id: job.id, phase: t.phase, title: t.title, sort_order: t.sort_order })
      }
      for (const d of (template.template_deliverables as { title: string; description: string | null; sort_order: number }[])) {
        await supabase.from('deliverables').insert({ job_id: job.id, title: d.title, description: d.description })
      }
    }
  }

  if (deliverablesJson) {
    const deliverables = JSON.parse(deliverablesJson) as { title: string; description?: string }[]
    for (const d of deliverables) {
      await supabase.from('deliverables').insert({ job_id: job.id, title: d.title, description: d.description || null })
    }
  }

  await supabase.from('activities').insert({
    action: 'job_created',
    details: `Job "${name}" created`,
    job_id: job.id,
    client_id: clientId,
  })

  revalidatePath('/dashboard/jobs')
  revalidatePath('/dashboard')
  redirect('/dashboard/jobs')
}

export async function updateJob(prevState: { error?: string } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const name = formData.get('name') as string
  const shootDate = formData.get('shootDate') as string
  const shootLocation = formData.get('shootLocation') as string
  const quoteValue = formData.get('quoteValue') as string
  const notes = formData.get('notes') as string
  const status = formData.get('status') as string

  if (!name) return { error: 'Job name is required.' }

  const supabase = await createServerSupabaseClient()
  const { data: job } = await supabase.from('jobs').select('status, client_id, name').eq('id', jobId).single()
  if (!job) return { error: 'Job not found.' }

  const statusChanged = status && status !== job.status

  await supabase.from('jobs').update({
    name,
    shoot_date: shootDate ? new Date(shootDate).toISOString() : null,
    shoot_location: shootLocation || null,
    quote_value: quoteValue ? parseFloat(quoteValue) : null,
    notes: notes || null,
    ...(status ? { status } : {}),
  }).eq('id', jobId)

  if (statusChanged) {
    await supabase.from('activities').insert({ action: 'status_changed', details: `Status changed to ${status}`, job_id: jobId, client_id: job.client_id })
    await supabase.from('notifications').insert({ title: 'Job Status Updated', message: `"${name}" is now ${status}`, type: 'status_change', job_id: jobId, client_id: job.client_id })
  }

  revalidatePath('/dashboard/jobs')
  revalidatePath(`/dashboard/jobs/${jobId}`)
  redirect(`/dashboard/jobs/${jobId}`)
}

export async function updateJobStatus(jobId: string, newStatus: string) {
  const supabase = await createServerSupabaseClient()
  const { data: job } = await supabase.from('jobs').select('client_id, name').eq('id', jobId).single()
  if (!job) return

  await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId)
  await supabase.from('activities').insert({ action: 'status_changed', details: `Status changed to ${newStatus}`, job_id: jobId, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Job Status Updated', message: `"${job.name}" is now ${newStatus}`, type: 'status_change', job_id: jobId, client_id: job.client_id })

  revalidatePath('/dashboard/jobs')
  revalidatePath(`/dashboard/jobs/${jobId}`)
  revalidatePath('/dashboard')
}

export async function deleteJob(jobId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('jobs').delete().eq('id', jobId)
  revalidatePath('/dashboard/jobs')
  revalidatePath('/dashboard')
  redirect('/dashboard/jobs')
}

export async function toggleTask(taskId: string, completed: boolean) {
  const supabase = await createServerSupabaseClient()
  const { data: task } = await supabase.from('job_tasks').select('job_id').eq('id', taskId).single()
  if (!task) return
  await supabase.from('job_tasks').update({ completed }).eq('id', taskId)
  revalidatePath(`/dashboard/jobs/${task.job_id}`)
}

export async function addRevision(prevState: { error?: string } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const request = formData.get('request') as string

  if (!request) return { error: 'Please describe the changes requested.' }

  const supabase = await createServerSupabaseClient()
  const { data: job } = await supabase.from('jobs').select('revisions_used, client_id, name').eq('id', jobId).single()
  if (!job) return { error: 'Job not found.' }

  const round = job.revisions_used + 1

  await supabase.from('revisions').insert({ job_id: jobId, round, request })
  await supabase.from('jobs').update({ revisions_used: round }).eq('id', jobId)
  await supabase.from('activities').insert({ action: 'revision_requested', details: `Revision round ${round} requested`, job_id: jobId, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Revision Requested', message: `Round ${round} for "${job.name}"`, type: 'revision_request', job_id: jobId, client_id: job.client_id })

  revalidatePath(`/dashboard/jobs/${jobId}`)
  return {}
}
