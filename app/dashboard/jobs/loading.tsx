import { PageHeader, Tabs, Rows } from '@/components/Skeleton'

// Mirrors app/dashboard/jobs/page.tsx: title, search and New Job, the status
// tabs, then the list.
export default function JobsLoading() {
  return (
    <div className="animate-fade-in">
      <PageHeader actions={2} />
      <Tabs count={6} />
      <Rows count={6} />
    </div>
  )
}
