import { Line, PageHeader } from '@/components/Skeleton'

// Mirrors app/dashboard/jobs/new/page.tsx: back link over "New Job", the
// client and job-name card, the two job-type cards, then the details card.
export default function NewJobLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader back />
      <div className="card space-y-5">
        <Line h={60} r={22} />
        <Line h={60} r={22} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => <div key={i} className="card" style={{ height: 120 }} />)}
      </div>
      <div className="card space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Line key={i} h={60} r={22} />)}
        </div>
      </div>
    </div>
  )
}
