import { PageHeader, Rows } from '@/components/Skeleton'

// Mirrors app/dashboard/documents/page.tsx: the header with its search, then
// the list.
export default function DocumentsLoading() {
  return (
    <div className="animate-fade-in">
      <PageHeader subtitle actions={1} />
      <Rows count={6} />
    </div>
  )
}
