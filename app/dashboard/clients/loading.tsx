import { PageHeader, Tabs, Rows } from '@/components/Skeleton'

// Mirrors app/dashboard/clients/page.tsx, which carries two tab rows: status
// and category.
export default function ClientsLoading() {
  return (
    <div className="animate-fade-in">
      <PageHeader actions={3} />
      <Tabs count={5} />
      <Tabs count={4} />
      <Rows count={5} />
    </div>
  )
}
