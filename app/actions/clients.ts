'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendWelcomeEmail } from '@/lib/email'

// Service-role client that bypasses RLS. Used for cleanup on tables where the
// user's auth session doesn't have UPDATE/DELETE policies (e.g. email_logs).
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key)
}

export async function createClient(prevState: { error?: string } | undefined, formData: FormData) {
  const name = formData.get('name') as string
  const contactPerson = formData.get('contactPerson') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const location = formData.get('location') as string
  const leadSource = formData.get('leadSource') as string
  const firstContact = formData.get('firstContact') as string
  const pipelineStage = formData.get('pipelineStage') as string
  const status = formData.get('status') as string
  const notes = formData.get('notes') as string
  const tagsRaw = formData.get('tags') as string

  if (!name) return { error: 'Client / business name is required.' }

  const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)) : null

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('clients').insert({
    name,
    contact_person: contactPerson || null,
    email: email || null,
    phone: phone || null,
    location: location || null,
    lead_source: leadSource || null,
    first_contact: firstContact ? new Date(firstContact).toISOString() : null,
    pipeline_stage: pipelineStage || 'enquiry',
    status: status || 'lead',
    notes: notes || null,
    tags,
  })

  if (error) return { error: error.message }

  if (email) {
    sendWelcomeEmail(email, name).catch(() => {})
  }

  revalidatePath('/dashboard/clients')
  redirect('/dashboard/clients')
}

export async function updateClient(prevState: { error?: string } | undefined, formData: FormData) {
  const clientId = formData.get('clientId') as string
  const name = formData.get('name') as string
  const contactPerson = formData.get('contactPerson') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const location = formData.get('location') as string
  const leadSource = formData.get('leadSource') as string
  const firstContact = formData.get('firstContact') as string
  const pipelineStage = formData.get('pipelineStage') as string
  const status = formData.get('status') as string
  const notes = formData.get('notes') as string
  const tagsRaw = formData.get('tags') as string

  if (!name) return { error: 'Client / business name is required.' }

  const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)) : null

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('clients').update({
    name,
    contact_person: contactPerson || null,
    email: email || null,
    phone: phone || null,
    location: location || null,
    lead_source: leadSource || null,
    first_contact: firstContact ? new Date(firstContact).toISOString() : null,
    pipeline_stage: pipelineStage || 'enquiry',
    status,
    notes: notes || null,
    tags,
  }).eq('id', clientId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/clients')
  revalidatePath(`/dashboard/clients/${clientId}`)
  redirect(`/dashboard/clients/${clientId}`)
}

export async function updateClientStatus(clientId: string, status: string) {
  const allowed = ['active', 'lead', 'past', 'archived']
  if (!allowed.includes(status)) return { error: 'Invalid status.' }
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('clients').update({ status }).eq('id', clientId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/clients')
  revalidatePath(`/dashboard/clients/${clientId}`)
  return { ok: true }
}

export async function deleteClient(clientId: string): Promise<{ error?: string } | never> {
  const supabase = await createServerSupabaseClient()
  const admin = getAdminClient()

  // email_logs.client_id FK has no ON DELETE action, and email_logs has RLS
  // with no UPDATE policy — so we must use the service-role client to null
  // those refs before the clients delete can succeed.
  if (admin) {
    const { error: logErr } = await admin
      .from('email_logs')
      .update({ client_id: null })
      .eq('client_id', clientId)
    if (logErr) {
      console.error('[deleteClient] email_logs cleanup failed:', logErr)
      return { error: `Couldn't clear email logs for this client: ${logErr.message}` }
    }
  } else {
    return { error: 'Missing SUPABASE_SERVICE_ROLE_KEY — set it in Vercel env vars so the server can clean up email_logs before deleting the client.' }
  }

  await supabase.from('documents').delete().eq('client_id', clientId)
  await supabase.from('notifications').delete().eq('client_id', clientId)

  const { error } = await supabase.from('clients').delete().eq('id', clientId)
  if (error) {
    console.error('[deleteClient] failed:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/clients')
  redirect('/dashboard/clients')
}

export async function deleteAllDocuments(): Promise<{ ok: true; count: number } | { error: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: existing } = await supabase.from('documents').select('id')
  const count = existing?.length ?? 0
  const { error } = await supabase.from('documents').delete().not('id', 'is', null)
  if (error) {
    console.error('[deleteAllDocuments] failed:', error)
    return { error: error.message }
  }
  revalidatePath('/dashboard/documents')
  return { ok: true, count }
}
