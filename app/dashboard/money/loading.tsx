import { Line, PageHeader, Rows } from '@/components/Skeleton'

export default function MoneyLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader subtitle actions={1} />
      <div className="card">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Line w={90} h={11} />
              <Line w={130} h={26} />
              <Line w={70} h={11} />
            </div>
          ))}
        </div>
      </div>
      <Rows count={5} />
    </div>
  )
}
