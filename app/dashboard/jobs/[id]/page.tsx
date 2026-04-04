import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import JobRecord from './JobRecord'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const job = await db.job.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      tasks: { orderBy: { sortOrder: 'asc' } },
      deliverables: { include: { deliveryFiles: { orderBy: { createdAt: 'desc' } } } },
      revisions: { orderBy: { round: 'asc' } },
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })

  if (!job) notFound()

  return <JobRecord job={JSON.parse(JSON.stringify(job))} />
}
