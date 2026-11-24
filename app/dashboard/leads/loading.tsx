import { PageHeader, Heading, Rows } from '@/components/Skeleton'

export default function LeadsLoading() {
  return (
    <div className="animate-fade-in dash-stack">
      <PageHeader subtitle actions={1} />
      <div>
        <Heading />
        <Rows count={4} />
      </div>
    </div>
  )
}
