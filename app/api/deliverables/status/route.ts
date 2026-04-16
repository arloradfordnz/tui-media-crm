import { createServerSupabaseClient } from '@/lib/supabase'
import { sendPortalDeliveryEmail } from '@/lib/email'
import { NextRequest } from 'next/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { fileId, status } = await request.json()

  if (!fileId || !status) {
    return Response.json({ error: 'File ID and status are required.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { delivery_status: status }
  if (status === 'viewed') updates.viewed_at = new Date().toISOString()
  if (status === 'approved') updates.approved_at = new Date().toISOString()

  const { error } = await supabase.from('delivery_files').update(updates).eq('id', fileId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (status === 'sent') {
    const { data: file } = await supabase
      .from('delivery_files')
      .select('deliverable_id')
      .eq('id', fileId)
      .single()

    if (file) {
      const { data: deliverable } = await supabase
        .from('deliverables')
        .select('job_id')
        .eq('id', file.deliverable_id)
        .single()

      if (deliverable) {
        const { data: job } = await supabase
          .from('jobs')
          .select('name, portal_token, client_id, clients(name, email)')
          .eq('id', deliverable.job_id)
          .single()

        if (job) {
          const client = job.clients as unknown as { name: string; email: string | null }
          if (client.email) {
            const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'}/portal/${job.portal_token}`
            await sendPortalDeliveryEmail(client.email, client.name, job.name, portalUrl)
          }

          await supabase.from('activities').insert({
            action: 'delivery_sent',
            details: `Delivery sent to client for "${job.name}"`,
            job_id: deliverable.job_id,
            client_id: job.client_id,
          })
          await supabase.from('notifications').insert({
            title: 'Delivery Sent',
            message: `Delivery email sent to client for "${job.name}"`,
            type: 'delivery_sent',
            job_id: deliverable.job_id,
            client_id: job.client_id,
          })
        }
      }
    }
  }

  return Response.json({ ok: true })
}
