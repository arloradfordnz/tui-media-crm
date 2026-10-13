import { BackLink, Line } from '@/components/Skeleton'

// Mirrors app/dashboard/documents/[id]/DocumentEditor.tsx: back link, then the
// editor card with its heading and template picker, the paired fields, the
// body, and the Save, Download and Email buttons.
export default function DocumentEditorLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <BackLink />
      <div className="card space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Line w={130} h={20} />
          <Line w={160} h={60} r={22} />
        </div>
        <Line h={60} r={22} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Line key={i} h={60} r={22} />)}
        </div>
        <Line h={132} r={22} />
        <div className="flex gap-3 flex-wrap">
          <Line w={168} h={44} r={999} />
          <Line w={168} h={44} r={999} />
          <Line w={168} h={44} r={999} />
        </div>
      </div>
    </div>
  )
}
