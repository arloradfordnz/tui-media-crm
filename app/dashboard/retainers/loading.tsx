import { PageHeader, Rows } from '@/components/Skeleton'

export default function RetainersLoading() {
  return (
    <div className="animate-fade-in">
      <PageHeader subtitle />
      <Rows count={3} />
    </div>
  )
}
