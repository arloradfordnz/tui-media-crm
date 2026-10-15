import { BackLink, Line, PageHeader } from '@/components/Skeleton'

// Mirrors DocumentEditor: back link, header with its actions, the tabs, then
// the document card on the left and the status card on the right.
export default function DocumentEditorLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <BackLink />
      <PageHeader />
      <Line w={220} h={30} r={999} />
      <div className="prop-editor-grid">
        <div className="card space-y-4">
          <Line w={160} h={12} />
          <Line w="50%" h={26} />
          <Line w="35%" h={14} />
          {[5, 3, 4, 3, 4].map((h, i) => (
            <div key={i} className="space-y-2 pt-3">
              <Line w={120} h={11} />
              <Line h={h * 14} r={14} />
            </div>
          ))}
        </div>
        <div className="prop-aside">
          <div className="card space-y-4">
            <Line w={80} h={12} />
            <Line h={70} r={14} />
          </div>
        </div>
      </div>
    </div>
  )
}
