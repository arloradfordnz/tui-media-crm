import { createServerSupabaseClient } from '@/lib/supabase'
import CalendarView from './CalendarView'

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const params = await searchParams
  const now = new Date()
  const month = params.month ? parseInt(params.month) : now.getMonth()
  const year = params.year ? parseInt(params.year) : now.getFullYear()

  const startDate = new Date(year, month, 1).toISOString()
  const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

  const supabase = await createServerSupabaseClient()

  const [{ data: events }, { data: jobs }] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, event_type, date, start_time, end_time, notes, job_id, jobs(id, name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('start_time', { ascending: true }),
    supabase.from('jobs').select('id, name').order('name', { ascending: true }),
  ])

  // Normalise for CalendarView (expects camelCase)
  const normalisedEvents = (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.event_type,
    date: e.date,
    startTime: e.start_time,
    endTime: e.end_time,
    notes: e.notes,
    jobId: e.job_id,
    job: e.jobs as unknown as { id: string; name: string } | null,
  }))

  return (
    <CalendarView
      events={normalisedEvents}
      jobs={jobs ?? []}
      month={month}
      year={year}
    />
  )
}
