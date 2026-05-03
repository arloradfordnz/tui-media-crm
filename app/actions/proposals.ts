'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendProposalEmail, sendProposalAcceptedEmail } from '@/lib/email'

export async function createProposal(jobId: string) {
  const supabase = await createServerSupabaseClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, name, quote_value, client_id, clients(name, email)')
    .eq('id', jobId)
    .single()

  if (!job) return { error: 'Job not found.' }

  const { data: existing } = await supabase.from('proposals').select('id').eq('job_id', jobId).single()
  if (existing) {
    redirect(`/dashboard/jobs/${jobId}/proposal/${existing.id}`)
  }

  const client = job.clients as unknown as { name: string; email: string | null }
  const services = job.quote_value
    ? JSON.stringify([{ description: job.name, amount: job.quote_value }])
    : '[]'

  const { data: proposal, error } = await supabase.from('proposals').insert({
    job_id: jobId,
    cover_note: `Dear ${client.name},\n\nThank you for choosing Tui Media. We're excited to work with you on this project. Please find our proposal below.`,
    services,
    total_value: job.quote_value || 0,
    inclusions: 'Full coverage as outlined\nProfessional editing &amp; colour grading\nLicensed music where applicable\nTwo rounds of revisions\nFinal delivery via secure client portal',
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

  const supabase = await createServerSupabaseClient()
  const { data: proposal } = await supabase.from('proposals').select('job_id').eq('id', proposalId).single()
  if (!proposal) return { error: 'Proposal not found.' }

  await supabase.from('proposals').update({
    cover_note: coverNote || null,
    services: services || '[]',
    inclusions: inclusions || null,
    payment_terms: paymentTerms || '',
    total_value: totalValue ? parseFloat(totalValue) : 0,
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
  const supabase = await createServerSupabaseClient()

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, job_id, total_value, status, jobs(id, name, client_id, clients(name, email))')
    .eq('token', token)
    .single()

  if (!proposal || proposal.status !== 'sent') return { error: 'Proposal not available.' }

  const job = proposal.jobs as unknown as { id: string; name: string; client_id: string; clients: { name: string; email: string | null } }

  await supabase.from('proposals').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', proposal.id)
  await supabase.from('jobs').update({ status: 'booked', quote_value: proposal.total_value }).eq('id', proposal.job_id)

  await supabase.from('activities').insert({ action: 'proposal_accepted', details: `Proposal accepted for "${job.name}"`, job_id: proposal.job_id, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Proposal Accepted!', message: `${job.clients.name} accepted the proposal for "${job.name}"`, type: 'status_change', job_id: proposal.job_id, client_id: job.client_id })

  // Notify admin via email — use first authenticated user's metadata or a fixed address
  await sendProposalAcceptedEmail('hello@tuimedia.nz', job.clients.name, job.name)

  revalidatePath(`/dashboard/jobs/${proposal.job_id}`)
}

export async function declineProposal(token: string) {
  const supabase = await createServerSupabaseClient()

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

  revalidatePath(`/dashboard/jobs/${proposal.job_id}`)
}
