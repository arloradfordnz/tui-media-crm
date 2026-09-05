import { Line } from '@/components/Skeleton'

// Mirrors app/dashboard/insights/page.tsx: breadcrumb, title, the stat row,
// then the revenue block.
export default function InsightsLoading() {
  return (
    <div className="space-y-10 animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Line w={54} h={12} />
          <div style={{ marginTop: 8 }}><Line w={140} h={28} /></div>
        </div>
      </div>

      <div className="stat-row">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-row-item space-y-2">
            <Line w={120} h={13} />
            <Line w={140} h={28} />
            <Line w={80} h={12} />
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <Line w={130} h={13} />
                <Line w={150} h={30} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Line w={130} h={36} r={999} />
            <Line w={160} h={36} r={999} />
          </div>
        </div>
        <Line h={240} r={14} />
      </div>
    </div>
  )
}
