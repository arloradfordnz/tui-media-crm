import { db } from '@/lib/db'
import CalendarView from './CalendarView'

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const params = await searchParams
  const now = new Date()
  const month = params.month ? parseInt(params.month) : now.getMonth()
  const year = params.year ? parseInt(params.year) : now.getFullYear()

  const startDate = new Date(year, month, 1)
  const endDate = new Date(year, month + 1, 0, 23, 59, 59)

  const events = await db.event.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    orderBy: { startTime: 'asc' },
    include: { job: { select: { id: true, name: true } } },
  })

  const jobs = await db.job.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <CalendarView
      events={JSON.parse(JSON.stringify(events))}
      jobs={jobs}
      month={month}
      year={year}
    />
  )
}
