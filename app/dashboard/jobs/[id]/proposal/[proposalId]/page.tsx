import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import ProposalEditor from './ProposalEditor'

export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, job_id, token, status, cover_note, services, inclusions, payment_terms, total_value, sent_at, responded_at, created_at, jobs(id, name, job_type, shoot_date, shoot_location, client_id, clients(id, name))')
    .eq('id', proposalId)
    .single()

  if (!proposal || proposal.job_id !== id) notFound()

  const job = proposal.jobs as unknown as { id: string; name: string; job_type: string | null; shoot_date: string | null; shoot_location: string | null; client_id: string; clients: { id: string; name: string } }

  const proposalData = {
    id: proposal.id,
    jobId: proposal.job_id,
    token: proposal.token,
    status: proposal.status,
    coverNote: proposal.cover_note,
    services: proposal.services,
    inclusions: proposal.inclusions,
    paymentTerms: proposal.payment_terms,
    totalValue: proposal.total_value,
    sentAt: proposal.sent_at,
    respondedAt: proposal.responded_at,
    createdAt: proposal.created_at,
    job: {
      id: job.id,
      name: job.name,
      jobType: job.job_type,
      shootDate: job.shoot_date,
      shootLocation: job.shoot_location,
      client: job.clients,
    },
  }

  return <ProposalEditor proposal={proposalData} />
}
