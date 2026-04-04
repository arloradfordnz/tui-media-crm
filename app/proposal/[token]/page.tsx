import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import ProposalView from './ProposalView'

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const proposal = await db.proposal.findUnique({
    where: { token },
    include: {
      job: {
        select: {
          name: true,
          jobType: true,
          shootDate: true,
          shootLocation: true,
          client: { select: { name: true } },
        },
      },
    },
  })

  if (!proposal || proposal.status === 'draft') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Proposal not found</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>This link is invalid or the proposal has not been sent yet.</p>
      </div>
    )
  }

  return <ProposalView proposal={JSON.parse(JSON.stringify(proposal))} />
}
