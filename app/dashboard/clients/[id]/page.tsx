import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import ClientRecord from './ClientRecord'

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const { tab } = await searchParams

  const client = await db.client.findUnique({
    where: { id },
    include: {
      jobs: { orderBy: { createdAt: 'desc' }, select: { id: true, name: true, jobType: true, status: true, quoteValue: true, shootDate: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 20, include: { job: { select: { name: true } } } },
    },
  })

  if (!client) notFound()

  const completedJobs = client.jobs.filter((j) => j.status === 'delivered' || j.status === 'archived').length

  return (
    <ClientRecord
      client={JSON.parse(JSON.stringify(client))}
      completedJobs={completedJobs}
      activeTab={tab || 'details'}
    />
  )
}
