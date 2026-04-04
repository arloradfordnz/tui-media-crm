'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'

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

  const job = await db.job.create({
    data: {
      name,
      clientId,
      jobType: jobType || null,
      shootDate: shootDate ? new Date(shootDate) : null,
      shootLocation: shootLocation || null,
      quoteValue: quoteValue ? parseFloat(quoteValue) : null,
    },
  })

  // Copy tasks from form data or template
  if (tasksJson) {
    const tasks = JSON.parse(tasksJson) as { phase: string; title: string }[]
    for (let i = 0; i < tasks.length; i++) {
      await db.jobTask.create({
        data: { jobId: job.id, phase: tasks[i].phase, title: tasks[i].title, sortOrder: i },
      })
    }
  } else if (jobType) {
    const template = await db.jobTemplate.findUnique({
      where: { jobType },
      include: { templateTasks: { orderBy: { sortOrder: 'asc' } }, templateDeliverables: { orderBy: { sortOrder: 'asc' } } },
    })
    if (template) {
      for (const t of template.templateTasks) {
        await db.jobTask.create({ data: { jobId: job.id, phase: t.phase, title: t.title, sortOrder: t.sortOrder } })
      }
      for (const d of template.templateDeliverables) {
        await db.deliverable.create({ data: { jobId: job.id, title: d.title, description: d.description } })
      }
    }
  }

  if (deliverablesJson) {
    const deliverables = JSON.parse(deliverablesJson) as { title: string; description?: string }[]
    for (const d of deliverables) {
      await db.deliverable.create({ data: { jobId: job.id, title: d.title, description: d.description || null } })
    }
  }

  await db.activity.create({
    data: { action: 'job_created', details: `Job "${name}" created`, jobId: job.id, clientId },
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

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return { error: 'Job not found.' }

  const statusChanged = status && status !== job.status

  await db.job.update({
    where: { id: jobId },
    data: {
      name,
      shootDate: shootDate ? new Date(shootDate) : null,
      shootLocation: shootLocation || null,
      quoteValue: quoteValue ? parseFloat(quoteValue) : null,
      notes: notes || null,
      ...(status ? { status } : {}),
    },
  })

  if (statusChanged) {
    await db.activity.create({
      data: { action: 'status_changed', details: `Status changed to ${status}`, jobId, clientId: job.clientId },
    })
    await db.notification.create({
      data: { title: 'Job Status Updated', message: `"${name}" is now ${status}`, type: 'status_change', jobId, clientId: job.clientId },
    })
  }

  revalidatePath('/dashboard/jobs')
  revalidatePath(`/dashboard/jobs/${jobId}`)
  redirect(`/dashboard/jobs/${jobId}`)
}

export async function updateJobStatus(jobId: string, newStatus: string) {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return

  await db.job.update({ where: { id: jobId }, data: { status: newStatus } })

  await db.activity.create({
    data: { action: 'status_changed', details: `Status changed to ${newStatus}`, jobId, clientId: job.clientId },
  })
  await db.notification.create({
    data: { title: 'Job Status Updated', message: `"${job.name}" is now ${newStatus}`, type: 'status_change', jobId, clientId: job.clientId },
  })

  revalidatePath('/dashboard/jobs')
  revalidatePath(`/dashboard/jobs/${jobId}`)
  revalidatePath('/dashboard')
}

export async function deleteJob(jobId: string) {
  await db.job.delete({ where: { id: jobId } })
  revalidatePath('/dashboard/jobs')
  revalidatePath('/dashboard')
  redirect('/dashboard/jobs')
}

export async function toggleTask(taskId: string, completed: boolean) {
  const task = await db.jobTask.findUnique({ where: { id: taskId } })
  if (!task) return
  await db.jobTask.update({ where: { id: taskId }, data: { completed } })
  revalidatePath(`/dashboard/jobs/${task.jobId}`)
}

export async function addRevision(prevState: { error?: string } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const request = formData.get('request') as string

  if (!request) return { error: 'Please describe the changes requested.' }

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return { error: 'Job not found.' }

  const round = job.revisionsUsed + 1

  await db.revision.create({ data: { jobId, round, request } })
  await db.job.update({ where: { id: jobId }, data: { revisionsUsed: round } })

  await db.activity.create({
    data: { action: 'revision_requested', details: `Revision round ${round} requested`, jobId, clientId: job.clientId },
  })
  await db.notification.create({
    data: { title: 'Revision Requested', message: `Round ${round} for "${job.name}"`, type: 'revision_request', jobId, clientId: job.clientId },
  })

  revalidatePath(`/dashboard/jobs/${jobId}`)
  return {}
}
