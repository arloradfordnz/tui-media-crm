import { Line, PageHeader } from '@/components/Skeleton'

// Mirrors app/dashboard/calendar/CalendarView.tsx: header, month nav, then the
// month grid.
export default function CalendarLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader actions={1} />
      <div className="flex items-center gap-3">
        <Line w={32} h={32} r={999} />
        <Line w={150} h={20} />
        <Line w={32} h={32} r={999} />
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="grid grid-cols-7 gap-2" style={{ marginBottom: 10 }}>
          {Array.from({ length: 7 }).map((_, i) => <Line key={i} h={11} />)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => <Line key={i} h={56} r={10} />)}
        </div>
      </div>
    </div>
  )
}
