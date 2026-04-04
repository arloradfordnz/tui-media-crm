'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { sendProposalEmail, sendProposalAcceptedEmail } from '@/lib/email'

export async function createProposal(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } })
  if (!job) return { error: 'Job not found.' }

  // Check if a proposal already exists for this job
  const existing = await db.proposal.findFirst({ where: { jobId } })
  if (existing) {
    redirect(`/dashboard/jobs/${jobId}/proposal/${existing.id}`)
  }

  // Build default services from job data
  const services = job.quoteValue
    ? JSON.stringify([{ description: job.name, amount: job.quoteValue }])
    : '[]'

  const proposal = await db.proposal.create({
    data: {
      jobId,
      coverNote: `Dear ${job.client.name},\n\nThank you for choosing Tui Media. We're excited to work with you on this project. Please find our proposal below.`,
      services,
      totalValue: job.quoteValue || 0,
      inclusions: 'Full videography coverage as outlined\nProfessional colour grading\nLicensed music\nTwo rounds of revisions\nFinal delivery via secure client portal',
    },
  })

  await db.activity.create({
    data: { action: 'proposal_created', details: `Proposal created for "${job.name}"`, jobId, clientId: job.clientId },
  })

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

  const proposal = await db.proposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return { error: 'Proposal not found.' }

  await db.proposal.update({
    where: { id: proposalId },
    data: {
      coverNote: coverNote || null,
      services: services || '[]',
      inclusions: inclusions || null,
      paymentTerms: paymentTerms || '',
      totalValue: totalValue ? parseFloat(totalValue) : 0,
    },
  })

  revalidatePath(`/dashboard/jobs/${proposal.jobId}`)
  revalidatePath(`/dashboard/jobs/${proposal.jobId}/proposal/${proposalId}`)
  return { success: true }
}

export async function sendProposal(proposalId: string) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId }, include: { job: { include: { client: true } } } })
  if (!proposal) return { error: 'Proposal not found.' }

  await db.proposal.update({
    where: { id: proposalId },
    data: { status: 'sent', sentAt: new Date() },
  })

  await db.activity.create({
    data: { action: 'proposal_sent', details: `Proposal sent for "${proposal.job.name}"`, jobId: proposal.jobId, clientId: proposal.job.clientId },
  })
  await db.notification.create({
    data: { title: 'Proposal Sent', message: `Proposal for "${proposal.job.name}" has been sent`, type: 'status_change', jobId: proposal.jobId, clientId: proposal.job.clientId },
  })

  // Send email to client
  if (proposal.job.client.email) {
    const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://tuimedia.co.nz'}/proposal/${proposal.token}`
    await sendProposalEmail(proposal.job.client.email, proposal.job.client.name, proposal.job.name, proposalUrl)
  }

  revalidatePath(`/dashboard/jobs/${proposal.jobId}`)
  revalidatePath(`/dashboard/jobs/${proposal.jobId}/proposal/${proposalId}`)
}

export async function acceptProposal(token: string) {
  const proposal = await db.proposal.findUnique({ where: { token }, include: { job: { include: { client: true } } } })
  if (!proposal || proposal.status !== 'sent') return { error: 'Proposal not available.' }

  await db.proposal.update({
    where: { id: proposal.id },
    data: { status: 'accepted', respondedAt: new Date() },
  })

  // Move job to booked status
  await db.job.update({
    where: { id: proposal.jobId },
    data: { status: 'booked', quoteValue: proposal.totalValue },
  })

  await db.activity.create({
    data: { action: 'proposal_accepted', details: `Proposal accepted for "${proposal.job.name}"`, jobId: proposal.jobId, clientId: proposal.job.clientId },
  })
  await db.notification.create({
    data: { title: 'Proposal Accepted!', message: `${proposal.job.client?.name || 'Client'} accepted the proposal for "${proposal.job.name}"`, type: 'status_change', jobId: proposal.jobId, clientId: proposal.job.clientId },
  })

  // Notify admin via email
  const admin = await db.user.findFirst({ where: { role: 'admin' } })
  if (admin) {
    await sendProposalAcceptedEmail(admin.email, proposal.job.client.name, proposal.job.name)
  }

  revalidatePath(`/dashboard/jobs/${proposal.jobId}`)
}

export async function declineProposal(token: string) {
  const proposal = await db.proposal.findUnique({ where: { token }, include: { job: { include: { client: true } } } })
  if (!proposal || proposal.status !== 'sent') return { error: 'Proposal not available.' }

  await db.proposal.update({
    where: { id: proposal.id },
    data: { status: 'declined', respondedAt: new Date() },
  })

  await db.activity.create({
    data: { action: 'proposal_declined', details: `Proposal declined for "${proposal.job.name}"`, jobId: proposal.jobId, clientId: proposal.job.clientId },
  })
  await db.notification.create({
    data: { title: 'Proposal Declined', message: `Proposal for "${proposal.job.name}" was declined`, type: 'status_change', jobId: proposal.jobId, clientId: proposal.job.clientId },
  })

  revalidatePath(`/dashboard/jobs/${proposal.jobId}`)
}
