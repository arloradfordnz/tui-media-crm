import { createServerSupabaseClient } from '@/lib/supabase'
import ProposalView from './ProposalView'

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, job_id, token, status, cover_note, services, inclusions, payment_terms, total_value, sent_at, responded_at, created_at, jobs(name, job_type, shoot_date, shoot_location, clients(name))')
    .eq('token', token)
    .single()

  if (!proposal || proposal.status === 'draft') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Proposal not found</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>This link is invalid or the proposal has not been sent yet.</p>
      </div>
    )
  }

  const job = proposal.jobs as unknown as { name: string; job_type: string | null; shoot_date: string | null; shoot_location: string | null; clients: { name: string } }

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
      name: job.name,
      jobType: job.job_type,
      shootDate: job.shoot_date,
      shootLocation: job.shoot_location,
      client: { name: job.clients.name },
    },
  }

  return <ProposalView proposal={proposalData} />
}
