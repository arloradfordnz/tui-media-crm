'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { sendApprovalConfirmationEmail, sendRevisionRequestEmail, sendAdminDeliveryViewedEmail, sendAdminDeliveryApprovedEmail, sendAdminRevisionRequestedEmail } from '@/lib/email'
import { isAdminViewing } from '@/lib/admin-ip'

export async function approveDelivery(deliveryFileId: string, jobId: string) {
  const supabase = await createServerSupabaseClient()

  await supabase.from('delivery_files').update({
    delivery_status: 'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', deliveryFileId)

  const { data: file } = await supabase.from('delivery_files').select('original_name').eq('id', deliveryFileId).single()
  const fileName = file?.original_name || 'a delivery file'

  const { data: job } = await supabase
    .from('jobs')
    .select('id, name, client_id, clients(name, email)')
    .eq('id', jobId)
    .single()

  if (job) {
    const client = job.clients as unknown as { name: string; email: string | null }
    await supabase.from('jobs').update({ status: 'approved' }).eq('id', jobId)
    await supabase.from('activities').insert({ action: 'delivery_approved', details: 'Client approved delivery', job_id: jobId, client_id: job.client_id })
    await supabase.from('notifications').insert({ title: 'Delivery Approved', message: `Client approved a cut for "${job.name}"`, type: 'approved', job_id: jobId, client_id: job.client_id })

    const adminViewing = await isAdminViewing()
    if (client.email && !adminViewing) {
      await sendApprovalConfirmationEmail(client.email, client.name, job.name)
    }
    if (!adminViewing) {
      await sendAdminDeliveryApprovedEmail(client.name, job.name, fileName, jobId, job.client_id)
    }
  }

  revalidatePath('/portal/')
}

export async function requestChanges(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const request = formData.get('request') as string

  if (!request) return { error: 'Please describe the changes you need.' }

  const supabase = await createServerSupabaseClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('id, name, revisions_used, revision_limit, client_id, clients(name, email)')
    .eq('id', jobId)
    .single()

  if (!job) return { error: 'Job not found.' }

  if (job.revisions_used >= job.revision_limit) {
    return { error: `Revision limit reached (${job.revision_limit} rounds).` }
  }

  const round = job.revisions_used + 1
  const client = job.clients as unknown as { name: string; email: string | null }

  await supabase.from('revisions').insert({ job_id: jobId, round, request })
  await supabase.from('jobs').update({ revisions_used: round, status: 'editing' }).eq('id', jobId)
  await supabase.from('activities').insert({ action: 'revision_requested', details: `Client requested revision round ${round}`, job_id: jobId, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Revision Requested', message: `Client requested changes for "${job.name}" (round ${round})`, type: 'revision_request', job_id: jobId, client_id: job.client_id })

  const adminViewing1 = await isAdminViewing()
  if (client.email && !adminViewing1) {
    await sendRevisionRequestEmail(client.email, client.name, job.name, round)
  }
  if (!adminViewing1) {
    await sendAdminRevisionRequestedEmail(client.name, job.name, round, request, jobId, job.client_id)
  }

  revalidatePath('/portal/')
  return { success: true }
}

export async function requestDeliverableRevision(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const deliverableId = formData.get('deliverableId') as string
  const request = (formData.get('request') as string)?.trim()

  if (!deliverableId) return { error: 'Missing deliverable.' }
  if (!request) return { error: 'Please describe the changes you need.' }

  const supabase = await createServerSupabaseClient()
  const { data: deliverable } = await supabase
    .from('deliverables')
    .select('id, title, job_id, revision_limit, revisions_used')
    .eq('id', deliverableId)
    .single()

  if (!deliverable) return { error: 'Deliverable not found.' }

  const limit = deliverable.revision_limit ?? 2
  const used = deliverable.revisions_used ?? 0
  if (used >= limit) return { error: `Revision limit reached (${limit} round${limit !== 1 ? 's' : ''}).` }

  const round = used + 1

  const { data: job } = await supabase
    .from('jobs')
    .select('id, name, client_id, clients(name, email)')
    .eq('id', deliverable.job_id)
    .single()

  if (!job) return { error: 'Job not found.' }
  const client = job.clients as unknown as { name: string; email: string | null }

  await supabase.from('revisions').insert({ job_id: job.id, deliverable_id: deliverableId, round, request })
  await supabase.from('deliverables').update({ revisions_used: round }).eq('id', deliverableId)
  await supabase.from('jobs').update({ status: 'editing' }).eq('id', job.id)
  await supabase.from('activities').insert({
    action: 'revision_requested',
    details: `Client requested revision round ${round} on "${deliverable.title}"`,
    job_id: job.id,
    client_id: job.client_id,
  })
  await supabase.from('notifications').insert({
    title: 'Revision Requested',
    message: `Client requested changes on "${deliverable.title}" for "${job.name}" (round ${round})`,
    type: 'revision_request',
    job_id: job.id,
    client_id: job.client_id,
  })

  const adminViewing2 = await isAdminViewing()
  if (client?.email && !adminViewing2) {
    await sendRevisionRequestEmail(client.email, client.name, job.name, round)
  }
  if (!adminViewing2) {
    await sendAdminRevisionRequestedEmail(client?.name || 'Your client', `${job.name} — ${deliverable.title}`, round, request, job.id, job.client_id)
  }

  revalidatePath('/portal/')
  return { success: true }
}

export async function markViewed(deliveryFileId: string, jobId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: file } = await supabase.from('delivery_files').select('delivery_status, original_name').eq('id', deliveryFileId).single()

  if (file && file.delivery_status === 'sent') {
    const adminViewing = await isAdminViewing()
    // Don't mark as viewed or notify when the studio owner is the one viewing.
    if (adminViewing) return

    await supabase.from('delivery_files').update({ delivery_status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', deliveryFileId)

    const { data: job } = await supabase.from('jobs').select('name, client_id, clients(name)').eq('id', jobId).single()
    if (job) {
      const client = job.clients as unknown as { name: string } | null
      await supabase.from('notifications').insert({ title: 'Portal Viewed', message: `Client viewed delivery for "${job.name}"`, type: 'portal_viewed', job_id: jobId, client_id: job.client_id })
      await sendAdminDeliveryViewedEmail(client?.name || 'Your client', job.name, file.original_name || 'a delivery file', jobId, job.client_id)
    }
  }
}
