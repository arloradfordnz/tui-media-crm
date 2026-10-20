'use server'

import { revalidatePath } from 'next/cache'
import { sendApprovalConfirmationEmail, sendRevisionRequestEmail, sendAdminDeliveryViewedEmail, sendAdminDeliveryApprovedEmail, sendAdminRevisionRequestedEmail, sendAdminFileDownloadedEmail, sendApprovedVideoToMarketingEmail } from '@/lib/email'
import { isAdminViewing } from '@/lib/admin-ip'
import { createAdminClient } from '@/lib/supabase-admin'
import { emitAssistantEvent } from '@/lib/tui/events'

// The client portal is a PUBLIC page authenticated only by the unguessable
// portal_token in the URL. RLS no longer grants the anon role any access, so
// every read/write here goes through the service-role client AFTER we have
// matched the token to a client and confirmed the target row belongs to them.
// Never trust a jobId/fileId from the request without this ownership check.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

async function resolveClient(admin: Admin, portalToken: string): Promise<{ id: string; name: string; email: string | null; contact_person: string | null; marketing_email: string | null } | null> {
  if (!portalToken) return null
  const { data } = await admin.from('clients').select('id, name, email, contact_person, marketing_email').eq('portal_token', portalToken).single()
  return data ?? null
}

// Confirms the job exists AND belongs to the token's client. Returns the job
// (with client details) or null when the token doesn't own it.
async function authorizeJob(admin: Admin, jobId: string, clientId: string) {
  const { data: job } = await admin
    .from('jobs')
    .select('id, name, client_id, revisions_used, revision_limit, clients(name, email)')
    .eq('id', jobId)
    .single()
  if (!job || job.client_id !== clientId) return null
  return job
}

type ApprovalFile = { id: string; original_name: string; share_token: string; delivery_status: string }

/**
 * Mark a delivered file approved and tell everyone who needs to know.
 *
 * Shared by the Approve button and by a client downloading a video without
 * approving it, which Arlo treats as the same thing: you do not take the file
 * away if you are not happy with it. `how` only changes the wording Arlo sees.
 */
async function finishApproval(
  admin: Admin,
  { client, job, file, jobId, how }: {
    client: NonNullable<Awaited<ReturnType<typeof resolveClient>>>
    job: NonNullable<Awaited<ReturnType<typeof authorizeJob>>>
    file: ApprovalFile
    jobId: string
    how: 'client' | 'download'
  },
) {
  const deliveryFileId = file.id
  await admin.from('delivery_files').update({
    delivery_status: 'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', deliveryFileId)

  const fileName = file.original_name || 'a delivery file'
  const clientRel = job.clients as unknown as { name: string; email: string | null }

  await Promise.all([
    admin.from('jobs').update({ status: 'approved' }).eq('id', jobId),
    admin.from('activities').insert({ action: 'delivery_approved', details: how === 'download' ? 'Delivery approved automatically: the client downloaded it' : 'Client approved delivery', job_id: jobId, client_id: job.client_id }),
    admin.from('notifications').insert({ title: 'Delivery Approved', message: how === 'download' ? `Client downloaded a cut for "${job.name}", so it was approved automatically` : `Client approved a cut for "${job.name}"`, type: 'approved', job_id: jobId, client_id: job.client_id }),
  ])

  const adminViewing = await isAdminViewing()
  if (!adminViewing) {
    // Only on the first approval: pressing Approve twice should not send the
    // marketing person the same video twice.
    const alreadyApproved = file.delivery_status === 'approved'
    await Promise.all([
      clientRel.email ? sendApprovalConfirmationEmail(clientRel.email, clientRel.name, job.name) : Promise.resolve(),
      sendAdminDeliveryApprovedEmail(clientRel.name, job.name, fileName, jobId, job.client_id),
      client.marketing_email && !alreadyApproved
        ? sendApprovedVideoToMarketingEmail({
            to: client.marketing_email,
            clientName: clientRel.name,
            approverName: client.contact_person,
            jobName: job.name,
            fileName,
            shareUrl: `${APP_URL}/api/share/${file.share_token}`,
            clientId: job.client_id,
            jobId,
          })
        : Promise.resolve(),
    ])
  }

  // Good news, and the one client action that doesn't need chasing — worth
  // recording, not worth a text mid-lesson.
  emitAssistantEvent(admin, {
    kind: 'client_action',
    key: `client_action:approved:${deliveryFileId}`,
    subject: `${clientRel.name} ${how === 'download' ? 'downloaded (and so approved)' : 'approved'} a cut on ${job.name}`,
    severity: 'low',
    detail: { job_id: jobId, file: fileName },
  })
}

export async function approveDelivery(deliveryFileId: string, jobId: string, portalToken: string) {
  const admin = createAdminClient()
  if (!admin) return { error: 'Server misconfigured.' }

  const client = await resolveClient(admin, portalToken)
  if (!client) return { error: 'Not authorised.' }
  const job = await authorizeJob(admin, jobId, client.id)
  if (!job) return { error: 'Not authorised.' }

  // Make sure the file actually belongs to this job before touching it.
  const { data: file } = await admin
    .from('delivery_files')
    .select('id, original_name, share_token, delivery_status, deliverables(job_id)')
    .eq('id', deliveryFileId)
    .single()
  const fileJobId = (file?.deliverables as unknown as { job_id: string } | null)?.job_id
  if (!file || fileJobId !== jobId) return { error: 'Not authorised.' }

  await finishApproval(admin, { client, job, file: { ...file, id: deliveryFileId }, jobId, how: 'client' })

  revalidatePath('/portal/')
  return { success: true }
}

export async function requestChanges(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const jobId = formData.get('jobId') as string
  const portalToken = formData.get('portalToken') as string
  const request = formData.get('request') as string

  if (!request) return { error: 'Please describe the changes you need.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Server misconfigured.' }
  const client = await resolveClient(admin, portalToken)
  if (!client) return { error: 'Not authorised.' }
  const job = await authorizeJob(admin, jobId, client.id)
  if (!job) return { error: 'Not authorised.' }

  if (job.revisions_used >= job.revision_limit) {
    return { error: `Revision limit reached (${job.revision_limit} rounds).` }
  }

  const round = job.revisions_used + 1
  const clientRel = job.clients as unknown as { name: string; email: string | null }

  // Inserted on its own so the id is available for the email's deep link.
  const { data: newRevision } = await admin
    .from('revisions').insert({ job_id: jobId, round, request }).select('id').single()

  await Promise.all([
    admin.from('jobs').update({ revisions_used: round, status: 'editing' }).eq('id', jobId),
    admin.from('activities').insert({ action: 'revision_requested', details: `Client requested revision round ${round}`, job_id: jobId, client_id: job.client_id }),
    admin.from('notifications').insert({ title: 'Revision Requested', message: `Client requested changes for "${job.name}" (round ${round})`, type: 'revision_request', job_id: jobId, client_id: job.client_id }),
  ])

  const adminViewing = await isAdminViewing()
  if (!adminViewing) {
    await Promise.all([
      clientRel.email ? sendRevisionRequestEmail(clientRel.email, clientRel.name, job.name, round) : Promise.resolve(),
      sendAdminRevisionRequestedEmail(clientRel.name, job.name, round, request, jobId, job.client_id, newRevision?.id),
    ])
  }

  // A revision request is the client waiting on Arlo. Every hour it sits
  // unseen is an hour of turnaround, which is the thing Tui Media sells.
  emitAssistantEvent(admin, {
    kind: 'client_action',
    key: `client_action:revision:${jobId}:${round}`,
    subject: `${clientRel.name} requested changes on ${job.name} (round ${round}): ${request.slice(0, 140)}`,
    severity: 'high',
    urgent: true,
    detail: { job_id: jobId, round },
  })

  revalidatePath('/portal/')
  return { success: true }
}

export async function requestDeliverableRevision(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const deliverableId = formData.get('deliverableId') as string
  const portalToken = formData.get('portalToken') as string
  const request = (formData.get('request') as string)?.trim()

  if (!deliverableId) return { error: 'Missing deliverable.' }
  if (!request) return { error: 'Please describe the changes you need.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Server misconfigured.' }
  const client = await resolveClient(admin, portalToken)
  if (!client) return { error: 'Not authorised.' }

  const { data: deliverable } = await admin
    .from('deliverables')
    .select('id, title, job_id, revision_limit, revisions_used')
    .eq('id', deliverableId)
    .single()

  if (!deliverable) return { error: 'Deliverable not found.' }

  const job = await authorizeJob(admin, deliverable.job_id, client.id)
  if (!job) return { error: 'Not authorised.' }

  const limit = deliverable.revision_limit ?? 2
  const used = deliverable.revisions_used ?? 0
  if (used >= limit) return { error: `Revision limit reached (${limit} round${limit !== 1 ? 's' : ''}).` }

  const round = used + 1
  const clientRel = job.clients as unknown as { name: string; email: string | null }

  const { data: newRevision } = await admin
    .from('revisions').insert({ job_id: job.id, deliverable_id: deliverableId, round, request }).select('id').single()

  await Promise.all([
    admin.from('deliverables').update({ revisions_used: round }).eq('id', deliverableId),
    admin.from('jobs').update({ status: 'editing' }).eq('id', job.id),
    admin.from('activities').insert({
      action: 'revision_requested',
      details: `Client requested revision round ${round} on "${deliverable.title}"`,
      job_id: job.id,
      client_id: job.client_id,
    }),
    admin.from('notifications').insert({
      title: 'Revision Requested',
      message: `Client requested changes on "${deliverable.title}" for "${job.name}" (round ${round})`,
      type: 'revision_request',
      job_id: job.id,
      client_id: job.client_id,
    }),
  ])

  const adminViewing = await isAdminViewing()
  if (!adminViewing) {
    await Promise.all([
      clientRel?.email ? sendRevisionRequestEmail(clientRel.email, clientRel.name, job.name, round) : Promise.resolve(),
      sendAdminRevisionRequestedEmail(clientRel?.name || 'Your client', `${job.name} — ${deliverable.title}`, round, request, job.id, job.client_id, newRevision?.id),
    ])
  }

  emitAssistantEvent(admin, {
    kind: 'client_action',
    key: `client_action:revision:${deliverableId}:${round}`,
    subject: `${clientRel?.name || 'A client'} requested changes on "${deliverable.title}" for ${job.name} (round ${round}): ${request.slice(0, 140)}`,
    severity: 'high',
    urgent: true,
    detail: { job_id: job.id, deliverable_id: deliverableId, round },
  })

  revalidatePath('/portal/')
  return { success: true }
}

export async function markViewed(deliveryFileId: string, jobId: string, portalToken: string) {
  const admin = createAdminClient()
  if (!admin) return

  const client = await resolveClient(admin, portalToken)
  if (!client) return
  const job = await authorizeJob(admin, jobId, client.id)
  if (!job) return

  const { data: file } = await admin
    .from('delivery_files')
    .select('delivery_status, original_name, deliverables(job_id)')
    .eq('id', deliveryFileId)
    .single()
  const fileJobId = (file?.deliverables as unknown as { job_id: string } | null)?.job_id
  if (!file || fileJobId !== jobId) return
  if (file.delivery_status !== 'sent') return

  const adminViewing = await isAdminViewing()
  // Don't mark as viewed or notify when the studio owner is the one viewing.
  if (adminViewing) return

  const clientRel = job.clients as unknown as { name: string } | null
  await Promise.all([
    admin.from('delivery_files').update({ delivery_status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', deliveryFileId),
    admin.from('notifications').insert({ title: 'Portal Viewed', message: `Client viewed delivery for "${job.name}"`, type: 'portal_viewed', job_id: jobId, client_id: job.client_id }),
    sendAdminDeliveryViewedEmail(clientRel?.name || 'Your client', job.name, file.original_name || 'a delivery file', jobId, job.client_id),
  ])
}

const VIDEO_FILE = /\.(mp4|mov|m4v|webm|mkv)$/i

// Returns { approved: true } when this download also approved the video, so the
// portal can refresh the card.
export async function markDownloaded(deliveryFileId: string, jobId: string, portalToken: string): Promise<{ approved?: boolean } | void> {
  const admin = createAdminClient()
  if (!admin) return

  const client = await resolveClient(admin, portalToken)
  if (!client) return
  const job = await authorizeJob(admin, jobId, client.id)
  if (!job) return

  const { data: file } = await admin
    .from('delivery_files')
    .select('id, original_name, share_token, delivery_status, mime_type, archived_at, deliverables(job_id)')
    .eq('id', deliveryFileId)
    .single()
  const fileJobId = (file?.deliverables as unknown as { job_id: string } | null)?.job_id
  if (!file || fileJobId !== jobId) return

  const adminViewing = await isAdminViewing()
  // Don't notify when the studio owner is the one downloading.
  if (adminViewing) return

  // Taking a video away with you counts as signing it off: someone unhappy
  // with a cut asks for changes instead. Only a video that is still awaiting a
  // decision, so a photo, a PDF or an already-approved cut changes nothing.
  const isVideo = !!file.mime_type?.startsWith('video/') || VIDEO_FILE.test(file.original_name || '')
  const awaitingDecision = file.delivery_status === 'sent' || file.delivery_status === 'viewed'
  const autoApprove = isVideo && awaitingDecision && !file.archived_at
  if (autoApprove) {
    await finishApproval(admin, { client, job, file: { id: deliveryFileId, original_name: file.original_name, share_token: file.share_token, delivery_status: file.delivery_status }, jobId, how: 'download' })
    revalidatePath('/portal/')
  }

  const fileName = file.original_name || 'a delivery file'
  const clientRel = job.clients as unknown as { name: string } | null
  await Promise.all([
    admin.from('activities').insert({ action: 'delivery_downloaded', details: `Client downloaded "${fileName}"`, job_id: jobId, client_id: job.client_id }),
    admin.from('notifications').insert({ title: 'File Downloaded', message: `Client downloaded "${fileName}" for "${job.name}"`, type: 'delivery_downloaded', job_id: jobId, client_id: job.client_id }),
    // The approval email already says it was downloaded; a second one is noise.
    autoApprove ? Promise.resolve() : sendAdminFileDownloadedEmail(clientRel?.name || 'Your client', job.name, fileName, jobId, job.client_id),
  ])
  return autoApprove ? { approved: true } : undefined
}

// A client opening a document in their portal (the card is expanded). Records
// the first and latest view so the document page and the Documents list can
// show it, and tells Arlo the first time. His own visits do not count.
export async function recordDocumentView(docId: string, portalToken: string) {
  const admin = createAdminClient()
  if (!admin) return
  const client = await resolveClient(admin, portalToken)
  if (!client) return
  if (await isAdminViewing()) return

  const { data: doc } = await admin.from('documents').select('id, name, client_id, viewed_at, view_count, sent_at').eq('id', docId).single()
  if (!doc || !doc.sent_at || doc.client_id !== client.id) return

  const now = new Date().toISOString()
  await admin.from('documents').update({
    viewed_at: doc.viewed_at ?? now,
    last_viewed_at: now,
    view_count: (doc.view_count ?? 0) + 1,
  }).eq('id', doc.id)

  if (!doc.viewed_at) {
    await Promise.all([
      admin.from('activities').insert({ action: 'document_viewed', details: `${client.name} opened "${doc.name}"`, client_id: client.id }),
      admin.from('notifications').insert({ title: 'Document opened', message: `${client.name} opened "${doc.name}"`, type: 'document_viewed', client_id: client.id }),
    ])
  }
}
