import { Line, Heading } from '@/components/Skeleton'

// Mirrors app/dashboard/page.tsx: greeting, the date under it, three actions,
// This week, then the Tui AI / Needs you split.
//
// This used to draw three stacked full-width sections — Today, Needs you,
// then the Tui panel — none of which matched the real page, which puts Tui AI
// and Needs you side by side in a two-column split below This week. A
// skeleton in a different shape than what replaces it is its own small jolt,
// on the page opened more than any other.
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
        <Heading w={78} />
        <div className="today-empty"><Line w="60%" h={14} /></div>
      </section>

      <div className="today-split">
        <section className="today-split-main">
          <Heading w={64} />
          {/* Same height the panel itself resolves to, so nothing jumps. */}
          <div className="card" style={{ height: 420 }} />
        </section>

        <section className="today-split-side">
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
      </div>
    </div>
  )
}
