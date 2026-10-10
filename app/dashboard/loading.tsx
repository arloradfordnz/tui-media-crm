import { Line, Heading } from '@/components/Skeleton'
import { TxSkeleton } from './TransactionsCard'

// Mirrors app/dashboard/page.tsx, and has to be re-checked every time that
// page's layout moves — a skeleton in a different shape than what replaces it
// is its own small jolt, on the page opened more than any other.
//
// Current shape: greeting + two actions, then a two-column split that
// finishes level — Tui AI with the money panel under it on the left (the money
// card and a recent-transactions card stretch to the right column's height,
// sharing the extra), and on the right one "Your
// week" list and the subscriptions under it. Stacked below 1100px in the order
// Tui, Your week, Money, Subscriptions, same as the page.
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
        <div className="today-split-main dash-stack">
          <section className="today-tui">
            <Heading w={64} />
            <div className="card" style={{ flex: 1, minHeight: 460 }} />
          </section>

          {/* Matches MoneyPanelSkeleton, which is what actually renders here
              while Xero is still being fetched. */}
          <section className="today-money money-fill">
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
              <div className="money-mini-fill">
                <div className="money-chart-slot">
                  <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 12 }} />
                </div>
              </div>
            </div>
          </section>
          <TxSkeleton fill />
        </div>

        <div className="today-split-side dash-stack">
          <section className="today-week">
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

          <section className="today-subs">
            <Heading w={104} />
            <div className="card-flush">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4"
                  style={{ paddingTop: 15, paddingBottom: 15, borderBottom: i === 6 ? 'none' : '1px solid var(--bg-border)' }}
                >
                  <div className="flex-1 space-y-2" style={{ minWidth: 0 }}>
                    <Line w={`${58 - i * 4}%`} h={14} />
                    <Line w={96} h={11} />
                  </div>
                  <Line w={62} h={14} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
