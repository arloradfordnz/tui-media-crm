'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function approveDelivery(deliveryFileId: string, jobId: string) {
  await db.deliveryFile.update({
    where: { id: deliveryFileId },
    data: { deliveryStatus: 'approved', approvedAt: new Date() },
  })

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (job) {
    await db.job.update({ where: { id: jobId }, data: { status: 'approved' } })
    await db.activity.create({
      data: { action: 'delivery_approved', details: `Client approved delivery`, jobId, clientId: job.clientId },
    })
    await db.notification.create({
      data: { title: 'Delivery Approved', message: `Client approved a cut for "${job.name}"`, type: 'approved', jobId, clientId: job.clientId },
    })
  }

  revalidatePath(`/portal/`)
}

export async function requestChanges(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const request = formData.get('request') as string

  if (!request) return { error: 'Please describe the changes you need.' }

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return { error: 'Job not found.' }

  if (job.revisionsUsed >= job.revisionLimit) {
    return { error: `Revision limit reached (${job.revisionLimit} rounds).` }
  }

  const round = job.revisionsUsed + 1

  await db.revision.create({ data: { jobId, round, request } })
  await db.job.update({ where: { id: jobId }, data: { revisionsUsed: round, status: 'editing' } })

  await db.activity.create({
    data: { action: 'revision_requested', details: `Client requested revision round ${round}`, jobId, clientId: job.clientId },
  })
  await db.notification.create({
    data: { title: 'Revision Requested', message: `Client requested changes for "${job.name}" (round ${round})`, type: 'revision_request', jobId, clientId: job.clientId },
  })

  revalidatePath(`/portal/`)
  return { success: true }
}

export async function markViewed(deliveryFileId: string, jobId: string) {
  const file = await db.deliveryFile.findUnique({ where: { id: deliveryFileId } })
  if (file && file.deliveryStatus === 'sent') {
    await db.deliveryFile.update({
      where: { id: deliveryFileId },
      data: { deliveryStatus: 'viewed', viewedAt: new Date() },
    })

    const job = await db.job.findUnique({ where: { id: jobId } })
    if (job) {
      await db.notification.create({
        data: { title: 'Portal Viewed', message: `Client viewed delivery for "${job.name}"`, type: 'portal_viewed', jobId, clientId: job.clientId },
      })
    }
  }
}
