import { Line, PageHeader, Rows } from '@/components/Skeleton'

// Mirrors app/dashboard/clients/page.tsx: title with search, sync and New
// Client, then ONE row holding the status tabs on the left and the category
// tabs on the right (hidden on a phone), then the list.
export default function ClientsLoading() {
  return (
    <div className="animate-fade-in">
      <PageHeader actions={3} />
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap" style={{ paddingBottom: 10, borderBottom: '1px solid var(--bg-border)' }}>
        <div className="flex gap-5">
          {Array.from({ length: 5 }).map((_, i) => <Line key={i} w={54} h={14} />)}
        </div>
        <div className="hidden sm:flex gap-5">
          {Array.from({ length: 4 }).map((_, i) => <Line key={i} w={54} h={14} />)}
        </div>
      </div>
      <Rows count={6} />
    </div>
  )
}
