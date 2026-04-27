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
    if (tasks.length > 0) {
      await supabase.from('job_tasks').insert(
        tasks.map((t, i) => ({ job_id: job.id, phase: t.phase, title: t.title, sort_order: i }))
      )
    }
  } else if (jobType) {
    const { data: template } = await supabase
      .from('job_templates')
      .select('id, template_tasks(phase, title, sort_order), template_deliverables(title, description, sort_order)')
      .eq('job_type', jobType)
      .single()

    if (template) {
      const templateTasks = template.template_tasks as { phase: string; title: string; sort_order: number }[]
      const templateDeliverables = template.template_deliverables as { title: string; description: string | null; sort_order: number }[]
      await Promise.all([
        templateTasks?.length
          ? supabase.from('job_tasks').insert(
              templateTasks.map((t) => ({ job_id: job.id, phase: t.phase, title: t.title, sort_order: t.sort_order }))
            ).then(() => null)
          : Promise.resolve(null),
        templateDeliverables?.length
          ? supabase.from('deliverables').insert(
              templateDeliverables.map((d) => ({ job_id: job.id, title: d.title, description: d.description }))
            ).then(() => null)
          : Promise.resolve(null),
      ])
    }
  }

  if (deliverablesJson) {
    const deliverables = JSON.parse(deliverablesJson) as { title: string; description?: string }[]
    if (deliverables.length > 0) {
      await supabase.from('deliverables').insert(
        deliverables.map((d) => ({ job_id: job.id, title: d.title, description: d.description || null }))
      )
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
  const estimatedHours = formData.get('estimatedHours') as string
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
    estimated_hours: estimatedHours ? parseFloat(estimatedHours) : 0,
    notes: notes || null,
    ...(status ? { status } : {}),
  }).eq('id', jobId)

  if (statusChanged) {
    await logStatusChange(jobId, job.client_id, name, status)
  }

  revalidatePath('/dashboard/jobs')
  revalidatePath(`/dashboard/jobs/${jobId}`)
  redirect(`/dashboard/jobs/${jobId}`)
}

async function logStatusChange(jobId: string, clientId: string | null, jobName: string, newStatus: string) {
  const supabase = await createServerSupabaseClient()
  await Promise.all([
    supabase.from('activities').insert({ action: 'status_changed', details: `Status changed to ${newStatus}`, job_id: jobId, client_id: clientId }),
    supabase.from('notifications').insert({ title: 'Job Status Updated', message: `"${jobName}" is now ${newStatus}`, type: 'status_change', job_id: jobId, client_id: clientId }),
  ])
}

export async function updateJobStatus(jobId: string, newStatus: string) {
  const supabase = await createServerSupabaseClient()
  const { data: job } = await supabase.from('jobs').select('client_id, name').eq('id', jobId).single()
  if (!job) return

  await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId)
  await logStatusChange(jobId, job.client_id, job.name, newStatus)

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
  revalidatePath('/dashboard')
}

export async function addRevision(prevState: { error?: string } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const request = formData.get('request') as string

  if (!request) return { error: 'Please describe the changes requested.' }

  const supabase = await createServerSupabaseClient()
  const { data: job } = await supabase.from('jobs').select('revisions_used, client_id, name').eq('id', jobId).single()
  if (!job) return { error: 'Job not found.' }

  const round = job.revisions_used + 1

  await Promise.all([
    supabase.from('revisions').insert({ job_id: jobId, round, request }),
    supabase.from('jobs').update({ revisions_used: round }).eq('id', jobId),
    supabase.from('activities').insert({ action: 'revision_requested', details: `Revision round ${round} requested`, job_id: jobId, client_id: job.client_id }),
    supabase.from('notifications').insert({ title: 'Revision Requested', message: `Round ${round} for "${job.name}"`, type: 'revision_request', job_id: jobId, client_id: job.client_id }),
  ])

  revalidatePath(`/dashboard/jobs/${jobId}`)
  return {}
}
