import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import ProposalEditor from './ProposalEditor'

export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params

  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      job: {
        include: {
          client: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!proposal || proposal.jobId !== id) notFound()

  return <ProposalEditor proposal={JSON.parse(JSON.stringify(proposal))} />
}
