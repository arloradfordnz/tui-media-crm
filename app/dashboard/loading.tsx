import { Line, Heading } from '@/components/Skeleton'

// Mirrors app/dashboard/page.tsx, and has to be re-checked every time that
// page's layout moves — a skeleton in a different shape than what replaces it
// is its own small jolt, on the page opened more than any other.
//
// Current shape: greeting + two actions, then a two-column split — Tui AI
// running the full height of the left column, and on the right one "Your
// week" list (bookings and attention items share the same row treatment) with
// the money panel under it.
export default function DashboardLoading() {
  return (
    <div className="space-y-10 animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Line w={240} h={28} />
          <div style={{ marginTop: 10 }}><Line w={160} h={14} /></div>
        </div>
        <div className="page-header-actions">
          <Line w={140} h={44} r={999} />
          <Line w={124} h={44} r={999} />
        </div>
      </div>

      <div className="today-split">
        {/* The chat fills its column, so the placeholder has to as well — a
            fixed height here would collapse to a short card and then jump to
            full height when the real panel arrives. */}
        <section className="today-split-main">
          <Heading w={64} />
          <div className="card" style={{ flex: 1, minHeight: 460 }} />
        </section>

        <div className="today-split-side dash-stack">
          <section>
            <Heading w={86} />
            <div className="card-flush">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4"
                  style={{ paddingTop: 18, paddingBottom: 18, borderBottom: i === 3 ? 'none' : '1px solid var(--bg-border)' }}
                >
                  <Line w={8} h={8} r={999} />
                  <div className="flex-1 space-y-2" style={{ minWidth: 0 }}>
                    <Line w={`${68 - i * 8}%`} h={14} />
                    <Line w={110} h={11} />
                  </div>
                  <Line w={96} h={32} r={999} />
                </div>
              ))}
            </div>
          </section>

          {/* Matches MoneyPanelSkeleton, which is what actually renders here
              while Xero is still being fetched. */}
          <section>
            <Heading w={62} />
            <div className="card">
              <div className="money-mini-figures">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <Line w={44} h={11} />
                    <Line w={78} h={20} />
                  </div>
                ))}
              </div>
              <div className="skeleton" style={{ height: 240, borderRadius: 12 }} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
