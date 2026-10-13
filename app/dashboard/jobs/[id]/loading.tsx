import { BackLink, FormCard, Line, Tabs } from '@/components/Skeleton'

// Mirrors app/dashboard/jobs/[id]/JobRecord.tsx. This route had no loading
// page, so opening a job showed the Jobs LIST skeleton (tabs and rows) before a
// page that is nothing like it: back link, the job name over its client, date
// and place, the quote and status picker on the right, four section tabs, then
// the Work form.
export default function JobRecordLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <BackLink />
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <Line w={260} h={28} />
          <div style={{ marginTop: 10 }}><Line w={300} h={14} /></div>
        </div>
        <div className="flex items-center gap-3">
          <Line w={70} h={24} />
          <Line w={160} h={44} r={999} />
        </div>
      </div>
      <Tabs count={4} />
      <FormCard fields={6} textarea buttons={1} />
    </div>
  )
}
