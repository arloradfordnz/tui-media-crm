import { Line, PageHeader } from '@/components/Skeleton'

// Mirrors app/dashboard/documents/template/page.tsx: the back link, the
// header, then one card holding the wording box and its two buttons.
export default function ContractTemplateLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <Line w={150} h={16} />
      <PageHeader subtitle />
      <div className="card space-y-5">
        <Line h={420} r={22} />
        <div className="flex gap-3 flex-wrap">
          <Line w={168} h={44} r={999} />
          <Line w={168} h={44} r={999} />
        </div>
      </div>
    </div>
  )
}
