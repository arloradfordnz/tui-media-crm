'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendWelcomeEmail } from '@/lib/email'

export async function createClient(prevState: { error?: string } | undefined, formData: FormData) {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const location = formData.get('location') as string
  const leadSource = formData.get('leadSource') as string
  const firstContact = formData.get('firstContact') as string
  const pipelineStage = formData.get('pipelineStage') as string
  const status = formData.get('status') as string
  const notes = formData.get('notes') as string
  const tagsRaw = formData.get('tags') as string

  if (!name) return { error: 'Name is required.' }

  const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)) : null

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('clients').insert({
    name,
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
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const location = formData.get('location') as string
  const leadSource = formData.get('leadSource') as string
  const firstContact = formData.get('firstContact') as string
  const pipelineStage = formData.get('pipelineStage') as string
  const status = formData.get('status') as string
  const notes = formData.get('notes') as string
  const tagsRaw = formData.get('tags') as string

  if (!name) return { error: 'Name is required.' }

  const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)) : null

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('clients').update({
    name,
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

export async function deleteClient(clientId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('clients').delete().eq('id', clientId)
  revalidatePath('/dashboard/clients')
  redirect('/dashboard/clients')
}
