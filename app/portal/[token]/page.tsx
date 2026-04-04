import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import PortalView from './PortalView'

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const job = await db.job.findUnique({
    where: { portalToken: token },
    include: {
      client: { select: { name: true } },
      deliverables: {
        include: { deliveryFiles: { orderBy: { createdAt: 'desc' } } },
      },
      revisions: { orderBy: { round: 'desc' } },
    },
  })

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Link not found</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>This portal link is invalid or has expired.</p>
      </div>
    )
  }

  return <PortalView job={JSON.parse(JSON.stringify(job))} />
}
