import { BackLink, Line, PageHeader } from '@/components/Skeleton'

// Mirrors ProposalEditor: back link, header with the two actions, then the
// tabbed editor cards on the left and the status card on the right.
export default function ProposalLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <BackLink />
      <PageHeader />
      <div className="prop-editor-grid">
        <div className="space-y-4">
          <Line w={220} h={30} r={999} />
          {[9, 5, 6, 4].map((h, i) => (
            <div key={i} className="card space-y-3">
              <Line w={140} h={14} />
              <Line w="60%" h={11} />
              <Line h={h * 14} r={18} />
            </div>
          ))}
        </div>
        <div className="prop-aside">
          <div className="card space-y-4">
            <Line w={80} h={12} />
            <Line w={140} h={28} />
            <Line h={90} r={14} />
          </div>
        </div>
      </div>
    </div>
  )
}
