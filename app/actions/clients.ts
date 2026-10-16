'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser } from '@/lib/supabase-admin'
import { CUSTOMER_VALUE_OPTIONS, AD_SPEND_OPTIONS, approxFor } from '@/lib/application-fields'
import { sendWelcomeEmail } from '@/lib/email'
import { deleteClientAndLeftovers } from '@/lib/client-delete'

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
  const clientCategory = formData.get('clientCategory') as string
  const notes = formData.get('notes') as string
  const tagsRaw = formData.get('tags') as string
  const monthlyRetainerRaw = formData.get('monthlyRetainer') as string
  const shootsPerMonthRaw = formData.get('shootsPerMonth') as string
  const videosPerMonthRaw = formData.get('videosPerMonth') as string
  const industry = formData.get('industry') as string
  const brand = formData.get('brand') as string

  if (!name) return { error: 'Client / business name is required.' }

  const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)) : null
  const monthlyRetainer = monthlyRetainerRaw ? parseFloat(monthlyRetainerRaw) : null
  const shootsPerMonth = shootsPerMonthRaw ? parseInt(shootsPerMonthRaw, 10) : null
  const videosPerMonth = videosPerMonthRaw ? parseInt(videosPerMonthRaw, 10) : null

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
    client_category: clientCategory || null,
    industry: industry || null,
    brand: brand || 'tui_media',
    notes: notes || null,
    tags,
    monthly_retainer: monthlyRetainer,
    shoots_per_month: shootsPerMonth,
    videos_per_month: videosPerMonth,
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
  const marketingEmail = formData.get('marketingEmail') as string
  const location = formData.get('location') as string
  const leadSource = formData.get('leadSource') as string
  const firstContact = formData.get('firstContact') as string
  const pipelineStage = formData.get('pipelineStage') as string
  const status = formData.get('status') as string
  const clientCategory = formData.get('clientCategory') as string
  const notes = formData.get('notes') as string
  const tagsRaw = formData.get('tags') as string
  const monthlyRetainerRaw = formData.get('monthlyRetainer') as string
  const shootsPerMonthRaw = formData.get('shootsPerMonth') as string
  const videosPerMonthRaw = formData.get('videosPerMonth') as string
  // A month input posts '2026-08'; stored as the 1st of that month.
  const retainerPausedFrom = formData.get('retainerPausedFrom') as string
  const industry = formData.get('industry') as string
  const brand = formData.get('brand') as string
  const sells = formData.get('sells') as string
  const interest = formData.get('interest') as string
  const customerValueBand = formData.get('customerValueBand') as string
  const adSpendBand = formData.get('adSpendBand') as string
  const decisionMaker = formData.get('decisionMaker') as string
  const capacity = formData.get('capacity') as string
  const timeline = formData.get('timeline') as string

  if (!name) return { error: 'Client / business name is required.' }

  const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)) : null
  const monthlyRetainer = monthlyRetainerRaw ? parseFloat(monthlyRetainerRaw) : null
  const shootsPerMonth = shootsPerMonthRaw ? parseInt(shootsPerMonthRaw, 10) : null
  const videosPerMonth = videosPerMonthRaw ? parseInt(videosPerMonthRaw, 10) : null

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('clients').update({
    name,
    contact_person: contactPerson || null,
    email: email || null,
    phone: phone || null,
    marketing_email: marketingEmail?.trim() || null,
    location: location || null,
    lead_source: leadSource || null,
    first_contact: firstContact ? new Date(firstContact).toISOString() : null,
    pipeline_stage: pipelineStage || 'enquiry',
    status: status || 'lead',
    client_category: clientCategory || null,
    industry: industry || null,
    brand: brand || 'tui_media',
    // The application answers. Editable rather than read-only because plenty of
    // these arrive over the phone rather than through the form on the site.
    sells: sells || null,
    interest: interest || null,
    customer_value_band: customerValueBand || null,
    ad_spend_band: adSpendBand || null,
    // The number is derived from the band (a midpoint), because the new-job
    // form and Insights still read it. Unanswered stays null.
    customer_value: approxFor(CUSTOMER_VALUE_OPTIONS, customerValueBand),
    ad_spend_budget: approxFor(AD_SPEND_OPTIONS, adSpendBand),
    decision_maker: decisionMaker || null,
    capacity: capacity || null,
    timeline: timeline || null,
    notes: notes || null,
    tags,
    monthly_retainer: monthlyRetainer,
    shoots_per_month: shootsPerMonth,
    videos_per_month: videosPerMonth,
    retainer_paused_from: /^\d{4}-\d{2}$/.test(retainerPausedFrom ?? '') ? `${retainerPausedFrom}-01` : null,
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

export async function updateClientCategory(clientId: string, category: string | null) {
  // 'video_ads' is the post-rebrand offer; the rest stay for the retainer
  // clients still on the books. Leaving it off this list silently rejected
  // every attempt to categorise a new client from the list view.
  const allowed = ['video_ads', 'retainer', 'marketing', 'one_off', null]
  if (!allowed.includes(category)) return { error: 'Invalid category.' }
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('clients').update({ client_category: category }).eq('id', clientId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/clients')
  revalidatePath(`/dashboard/clients/${clientId}`)
  return { ok: true }
}

export async function deleteClient(clientId: string): Promise<{ error?: string } | never> {
  // Everything below runs with the service role, so the caller is checked here
  // rather than left to RLS. It also means a session token that is a little
  // stale cannot turn this into a delete that silently removes nothing, which
  // is what RLS does: no error, zero rows.
  if (!(await getAuthUser())) return { error: 'Not authorised. Sign out and back in, then try again.' }

  const admin = getAdminClient()
  if (!admin) {
    return { error: 'Missing SUPABASE_SERVICE_ROLE_KEY — set it in Vercel env vars so the server can delete clients.' }
  }

  const result = await deleteClientAndLeftovers(admin, clientId)
  if (result.error) {
    console.error('[deleteClient] failed:', result.error)
    return { error: result.error }
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

// Pull paid-invoice totals from Xero and write them onto each matched
// client's lifetime_value. Triggered from the Clients page; the morning
// briefing cron also runs the same sync daily.
export async function syncLifetimeValues() {
  const supabase = await createServerSupabaseClient()
  if (!(await getAuthUser())) return { error: 'Not authorised.' }

  const { syncClientLifetimeValues } = await import('@/lib/lifetime-value')
  try {
    const result = await syncClientLifetimeValues(supabase)
    if (!result.connected) return { error: 'Xero is not connected — connect it in Settings first.' }
    revalidatePath('/dashboard/clients')
    return result
  } catch (err) {
    console.error('[syncLifetimeValues] failed:', err)
    return { error: 'Sync failed — check the Xero connection and try again.' }
  }
}
