import { Line } from '@/components/Skeleton'

// Mirrors the first paint of app/dashboard/money/page.tsx: the title with its
// subtitle and the small "Revenue and trends" button, then the page's own
// InvoicesSkeleton (three two-line rows). Xero streams in behind that, so this
// is deliberately the same shape and not the summary card that arrives later:
// loading and fallback are then one continuous placeholder, with no jump
// between them.
export default function MoneyLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <Line w={110} h={28} />
          <div style={{ marginTop: 10 }}><Line w={230} h={14} /></div>
        </div>
        <Line w={170} h={36} r={999} />
      </div>
      <div className="card-flush">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-4 py-4" style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div className="skeleton" style={{ height: 14, width: '38%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 12, width: '22%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
