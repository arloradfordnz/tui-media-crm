import { Line, PageHeader, Rows } from '@/components/Skeleton'

// Mirrors app/dashboard/calendar/CalendarView.tsx: the title with Subscribe
// (not on a phone) and Add Event, the month switcher, then either the month
// grid (desktop: a flush card, a day-name row, five rows of 100px cells joined
// by hairlines) or the agenda list (phone). The same two class names the page
// uses decide which one shows.
export default function CalendarLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader actions={2} />
      <div className="flex items-center gap-4">
        <Line w={40} h={40} r={999} />
        <Line w={150} h={22} />
        <Line w={40} h={40} r={999} />
      </div>

      <div className="card-flush overflow-hidden calendar-grid-view">
        <div className="grid grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="py-3 flex justify-center"><Line w={28} h={11} /></div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="p-2"
              style={{ minHeight: 100, borderRight: '1px solid var(--bg-border)', borderBottom: '1px solid var(--bg-border)' }}
            >
              <Line w={18} h={12} />
            </div>
          ))}
        </div>
      </div>

      <div className="calendar-agenda-view">
        <Rows count={5} trailing={false} />
      </div>
    </div>
  )
}
