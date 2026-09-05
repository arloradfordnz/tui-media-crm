import { Line, Heading } from '@/components/Skeleton'

// Mirrors app/dashboard/page.tsx: greeting, the date under it, three actions,
// then Today, Needs you, and the Tui panel.
export default function DashboardLoading() {
  return (
    <div className="space-y-10 animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Line w={240} h={28} />
          <div style={{ marginTop: 10 }}><Line w={160} h={14} /></div>
        </div>
        <div className="page-header-actions">
          <Line w={110} h={32} r={999} />
          <Line w={140} h={44} r={999} />
          <Line w={124} h={44} r={999} />
        </div>
      </div>

      <section>
        <Heading w={54} />
        <div className="today-empty"><Line w="60%" h={14} /></div>
      </section>

      <section>
        <Heading w={86} />
        <div className="card-flush">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4"
              style={{ paddingTop: 18, paddingBottom: 18, borderBottom: i === 2 ? 'none' : '1px solid var(--bg-border)' }}
            >
              <Line w={8} h={8} r={999} />
              <div className="flex-1 space-y-2" style={{ minWidth: 0 }}>
                <Line w={`${64 - i * 8}%`} h={14} />
                <Line w={90} h={11} />
              </div>
              <Line w={104} h={32} r={999} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <Heading w={40} />
        {/* Same 420px the panel itself is, so nothing jumps when it arrives. */}
        <div className="card" style={{ height: 420 }} />
      </section>
    </div>
  )
}
