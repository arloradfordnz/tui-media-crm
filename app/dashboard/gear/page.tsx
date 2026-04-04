import { db } from '@/lib/db'
import GearView from './GearView'

export default async function GearPage({ searchParams }: { searchParams: Promise<{ category?: string; status?: string }> }) {
  const params = await searchParams
  const catFilter = params.category || 'all'
  const statusFilter = params.status || 'all'

  const where: Record<string, unknown> = {}
  if (catFilter !== 'all') where.category = catFilter
  if (statusFilter !== 'all') where.status = statusFilter

  const gear = await db.gear.findMany({ where, orderBy: { name: 'asc' } })

  return <GearView gear={JSON.parse(JSON.stringify(gear))} category={catFilter} status={statusFilter} />
}
