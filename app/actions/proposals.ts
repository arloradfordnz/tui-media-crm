'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendProposalEmail, sendProposalAcceptedEmail } from '@/lib/email'
import { emitAssistantEvent } from '@/lib/tui/events'

export async function createProposal(jobId: string) {
  const supabase = await createServerSupabaseClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, name, quote_value, client_id, clients(name, email, contact_person)')
    .eq('id', jobId)
    .single()

  if (!job) return { error: 'Job not found.' }

  const { data: existing } = await supabase.from('proposals').select('id').eq('job_id', jobId).single()
  if (existing) {
    redirect(`/dashboard/jobs/${jobId}/proposal/${existing.id}`)
  }

  const client = job.clients as unknown as { name: string; email: string | null; contact_person: string | null }
  const services = job.quote_value
    ? JSON.stringify([{ description: job.name, amount: job.quote_value }])
    : '[]'

  const { data: proposal, error } = await supabase.from('proposals').insert({
    job_id: jobId,
    // A starting point in Arlo's own voice, for when he writes one by hand.
    // Tui's drafted proposals replace all of this.
    cover_note: `Hi ${client.contact_person?.split(' ')[0] || 'there'},\n\nThanks for having a chat about ${job.name}. Here's what I'd suggest, with the price and what's included below.\n\nHave a look through and let me know if you want to tweak anything. If it all looks good, tap Accept and I'll be in touch to lock in a date.\n\nCheers,\nArlo`,
    services,
    total_value: job.quote_value || 0,
    inclusions: 'Filming on location\nEditing and colour grading\nLicensed music and captions\nTwo rounds of changes on each video\nFinal videos delivered through your client portal',
    payment_terms: '50% deposit to lock in the shoot date, then the rest on delivery. Invoices are due within 14 days by bank transfer. Tui Media is not GST registered, so no GST is added. This price is good for 30 days.',
  }).select('id').single()

  if (error || !proposal) return { error: error?.message || 'Failed to create proposal.' }

  await supabase.from('activities').insert({ action: 'proposal_created', details: `Proposal created for "${job.name}"`, job_id: jobId, client_id: job.client_id })

  revalidatePath(`/dashboard/jobs/${jobId}`)
  redirect(`/dashboard/jobs/${jobId}/proposal/${proposal.id}`)
}

export async function updateProposal(prevState: { error?: string } | undefined, formData: FormData) {
  const proposalId = formData.get('proposalId') as string
  const coverNote = formData.get('coverNote') as string
  const services = formData.get('services') as string
  const inclusions = formData.get('inclusions') as string
  const paymentTerms = formData.get('paymentTerms') as string
  const totalValue = formData.get('totalValue') as string
  const pricingMode = formData.get('pricingMode') === 'options' ? 'options' : 'total'
  const priceSuffix = ((formData.get('priceSuffix') as string) || '').trim()

  const supabase = await createServerSupabaseClient()
  const { data: proposal } = await supabase.from('proposals').select('job_id').eq('id', proposalId).single()
  if (!proposal) return { error: 'Proposal not found.' }

  await supabase.from('proposals').update({
    cover_note: coverNote || null,
    services: services || '[]',
    inclusions: inclusions || null,
    payment_terms: paymentTerms || '',
    total_value: totalValue ? parseFloat(totalValue) : 0,
    pricing_mode: pricingMode,
    price_suffix: priceSuffix || null,
  }).eq('id', proposalId)

  revalidatePath(`/dashboard/jobs/${proposal.job_id}`)
  revalidatePath(`/dashboard/jobs/${proposal.job_id}/proposal/${proposalId}`)
  return { success: true }
}

export async function sendProposal(proposalId: string) {
  const supabase = await createServerSupabaseClient()

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, job_id, token, jobs(id, name, client_id, clients(name, email))')
    .eq('id', proposalId)
    .single()

  if (!proposal) return { error: 'Proposal not found.' }

  await supabase.from('proposals').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', proposalId)

  const job = proposal.jobs as unknown as { id: string; name: string; client_id: string; clients: { name: string; email: string | null } }

  await supabase.from('activities').insert({ action: 'proposal_sent', details: `Proposal sent for "${job.name}"`, job_id: proposal.job_id, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Proposal Sent', message: `Proposal for "${job.name}" has been sent`, type: 'status_change', job_id: proposal.job_id, client_id: job.client_id })

  if (job.clients.email) {
    const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'}/proposal/${proposal.token}`
    await sendProposalEmail(job.clients.email, job.clients.name, job.name, proposalUrl)
  }

  revalidatePath(`/dashboard/jobs/${proposal.job_id}`)
  revalidatePath(`/dashboard/jobs/${proposal.job_id}/proposal/${proposalId}`)
}

export async function acceptProposal(token: string) {
  // Public proposal page — no login. Auth is the token; write with service role.
  const supabase = createAdminClient()
  if (!supabase) return { error: 'Server misconfigured.' }

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, job_id, total_value, status, pricing_mode, jobs(id, name, client_id, clients(name, email))')
    .eq('token', token)
    .single()

  if (!proposal || proposal.status !== 'sent') return { error: 'Proposal not available.' }

  const job = proposal.jobs as unknown as { id: string; name: string; client_id: string; clients: { name: string; email: string | null } }

  await supabase.from('proposals').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', proposal.id)
  // When the client is choosing between packages there is no single price to
  // carry onto the job, so only the status moves.
  const picksPackage = proposal.pricing_mode === 'options'
  await supabase.from('jobs').update(picksPackage ? { status: 'booked' } : { status: 'booked', quote_value: proposal.total_value }).eq('id', proposal.job_id)

  await supabase.from('activities').insert({ action: 'proposal_accepted', details: `Proposal accepted for "${job.name}"`, job_id: proposal.job_id, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Proposal Accepted!', message: `${job.clients.name} accepted the proposal for "${job.name}"`, type: 'status_change', job_id: proposal.job_id, client_id: job.client_id })

  // Notify admin via email — use first authenticated user's metadata or a fixed address
  await sendProposalAcceptedEmail('hello@tuimedia.nz', job.clients.name, job.name)

  // Won work. Also the moment a proposals_awaiting_response flag stops being
  // true, which the next sweep resolves on its own.
  emitAssistantEvent(supabase, {
    kind: 'client_action',
    key: `client_action:proposal_accepted:${proposal.id}`,
    subject: `${job.clients.name} accepted the proposal for ${job.name}${proposal.total_value && !picksPackage ? ` ($${proposal.total_value})` : ''}`,
    severity: 'high',
    urgent: true,
    detail: { job_id: proposal.job_id, value: proposal.total_value },
  })

  revalidatePath(`/dashboard/jobs/${proposal.job_id}`)
}

export async function declineProposal(token: string) {
  const supabase = createAdminClient()
  if (!supabase) return { error: 'Server misconfigured.' }

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, job_id, status, jobs(name, client_id)')
    .eq('token', token)
    .single()

  if (!proposal || proposal.status !== 'sent') return { error: 'Proposal not available.' }

  const job = proposal.jobs as unknown as { name: string; client_id: string }

  await supabase.from('proposals').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', proposal.id)
  await supabase.from('activities').insert({ action: 'proposal_declined', details: `Proposal declined for "${job.name}"`, job_id: proposal.job_id, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Proposal Declined', message: `Proposal for "${job.name}" was declined`, type: 'status_change', job_id: proposal.job_id, client_id: job.client_id })

  // Losing one is worth knowing about promptly too, while the reasons are
  // still askable.
  emitAssistantEvent(supabase, {
    kind: 'client_action',
    key: `client_action:proposal_declined:${proposal.id}`,
    subject: `The proposal for ${job.name} was declined`,
    severity: 'normal',
    urgent: true,
    detail: { job_id: proposal.job_id },
  })

  revalidatePath(`/dashboard/jobs/${proposal.job_id}`)
}
