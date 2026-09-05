import { Line, Rows } from '@/components/Skeleton'

// Mirrors app/dashboard/finance/FinanceDashboard.tsx: title and subtitle, the
// hero figure, the two chart figures with their controls, the plot, then the
// two cards and the transactions list.
export default function FinanceLoading() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <Line w={140} h={28} />
        <div style={{ marginTop: 10 }}><Line w={300} h={14} /></div>
      </div>

      <div className="space-y-3">
        <Line w={150} h={11} />
        <Line w={260} h={52} />
        <Line w={320} h={13} />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <Line w={110} h={13} />
                <Line w={150} h={30} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Line w={168} h={44} r={999} />
            <Line w={104} h={44} r={999} />
          </div>
        </div>
        <Line h={240} r={14} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="card space-y-3">
            <Line w={130} h={11} />
            <Line w={160} h={32} />
            <Line w="80%" h={13} />
          </div>
        ))}
      </div>

      <Rows count={4} trailing={false} />
    </div>
  )
}
