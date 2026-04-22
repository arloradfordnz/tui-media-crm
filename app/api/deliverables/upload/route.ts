import { createServerSupabaseClient } from '@/lib/supabase'
import { signedUploadUrl, deleteObject } from '@/lib/r2'
import { sendPortalDeliveryEmail } from '@/lib/email'
import { NextRequest } from 'next/server'

// Step 1: client requests a presigned PUT URL and creates a pending DB row.
// Step 2: client PUTs the file directly to R2 (bypasses this server — no size limit).
// Step 3: client calls PATCH to flip the row from 'uploading' to 'not_sent'.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const body = await request.json()
  const { deliverableId, fileName, fileSize, mimeType, versionLabel, notes } = body

  if (!deliverableId || !fileName || !mimeType) {
    return Response.json({ error: 'deliverableId, fileName and mimeType are required.' }, { status: 400 })
  }

  const timestamp = Date.now()
  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
  const storageKey = `${deliverableId}/${timestamp}_${safeName}`

  let uploadUrl: string
  try {
    uploadUrl = await signedUploadUrl(storageKey, mimeType)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }

  const { data: record, error: dbError } = await supabase.from('delivery_files').insert({
    deliverable_id: deliverableId,
    file_name: storageKey,
    original_name: fileName,
    file_url: null,
    size: fileSize ?? null,
    mime_type: mimeType,
    version_label: versionLabel || 'first_cut',
    personal_note: notes || null,
    delivery_status: 'uploading',
  }).select('id, original_name, version_label, delivery_status, created_at, file_url, personal_note').single()

  if (dbError) {
    return Response.json({ error: dbError.message }, { status: 500 })
  }

  return Response.json({ fileId: record.id, uploadUrl, storageKey, file: record })
}

// Called by the browser after the R2 PUT succeeds.
export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { fileId } = await request.json()

  if (!fileId) {
    return Response.json({ error: 'fileId is required.' }, { status: 400 })
  }

  // Flip to 'sent' so the file shows on the portal and kicks off the client email.
  const { data: record, error } = await supabase
    .from('delivery_files')
    .update({ delivery_status: 'sent' })
    .eq('id', fileId)
    .select('id, deliverable_id, original_name, version_label, delivery_status, created_at, file_url, personal_note')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Fire the client email + activity/notification records (best-effort; don't block the response on failure).
  try {
    const { data: deliverable } = await supabase
      .from('deliverables')
      .select('job_id')
      .eq('id', record.deliverable_id)
      .single()

    if (deliverable) {
      const { data: job } = await supabase
        .from('jobs')
        .select('name, portal_token, client_id, clients(name, email, portal_token)')
        .eq('id', deliverable.job_id)
        .single()

      if (job) {
        const client = job.clients as unknown as { name: string; email: string | null; portal_token: string | null }
        const portalToken = client.portal_token || job.portal_token
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'
        const portalUrl = `${appUrl}/portal/client/${portalToken}`

        if (client.email) {
          await sendPortalDeliveryEmail(client.email, client.name, job.name, portalUrl, job.client_id, deliverable.job_id)
        }

        await supabase.from('activities').insert({
          action: 'delivery_sent',
          details: `Delivery "${record.original_name}" sent to client for "${job.name}"`,
          job_id: deliverable.job_id,
          client_id: job.client_id,
        })
        await supabase.from('notifications').insert({
          title: 'Delivery Sent',
          message: `New file delivered to client for "${job.name}"`,
          type: 'delivery_sent',
          job_id: deliverable.job_id,
          client_id: job.client_id,
        })
      }
    }
  } catch (e) {
    console.error('[deliverables/upload PATCH email]', e)
  }

  return Response.json({ file: record })
}

// Called if the R2 PUT fails — removes the orphaned pending row and object.
export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { fileId } = await request.json()

  if (!fileId) {
    return Response.json({ error: 'fileId is required.' }, { status: 400 })
  }

  const { data: file } = await supabase
    .from('delivery_files')
    .select('file_name')
    .eq('id', fileId)
    .single()

  if (file?.file_name) {
    try { await deleteObject(file.file_name) } catch {}
  }

  await supabase.from('delivery_files').delete().eq('id', fileId)
  return Response.json({ ok: true })
}
