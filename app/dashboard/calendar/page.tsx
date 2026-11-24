import { createServerSupabaseClient } from '@/lib/supabase'
import CalendarView from './CalendarView'
import { slotEvents } from '@/lib/instagram-slots'

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const params = await searchParams
  const now = new Date()
  const month = params.month ? parseInt(params.month) : now.getMonth()
  const year = params.year ? parseInt(params.year) : now.getFullYear()

  const startDate = new Date(year, month, 1).toISOString()
  const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

  const supabase = await createServerSupabaseClient()

  const pad = (n: number) => String(n).padStart(2, '0')
  const firstDay = `${year}-${pad(month + 1)}-01`
  const lastDay = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`

  const [{ data: events }, { data: jobs }, { data: clients }, posts] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, event_type, date, start_time, end_time, notes, job_id, client_id, jobs(id, name), clients(id, name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('start_time', { ascending: true }),
    supabase.from('jobs').select('id, name, client_id').order('name', { ascending: true }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    // Tui Media's two Instagram posts a week, worked out rather than stored,
    // so they never reach the phone calendar. Empty before the migration.
    slotEvents(supabase, firstDay, lastDay).catch(() => []),
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
    client: e.clients as unknown as { id: string; name: string } | null,
  }))
  const postSlots = posts.map((p) => ({
    id: p.id,
    title: p.title,
    eventType: 'post',
    date: `${p.date}T00:00:00+00:00`,
    startTime: null,
    endTime: null,
    notes: p.covered ? null : 'Tui Media Instagram. Tick it off on Today once it is up.',
    jobId: null,
    job: null,
    client: null,
  }))
  normalisedEvents.push(...postSlots)

  return (
    <CalendarView
      events={normalisedEvents}
      jobs={jobs ?? []}
      clients={clients ?? []}
      month={month}
      year={year}
      feedToken={process.env.CALENDAR_FEED_SECRET ?? null}
    />
  )
}
