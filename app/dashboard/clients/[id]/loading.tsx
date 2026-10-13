import { BackLink, FormCard, Line, Tabs } from '@/components/Skeleton'

// Mirrors app/dashboard/clients/[id]/ClientRecord.tsx. No loading page here
// meant the Clients LIST skeleton showed first. The record is: back link, the
// name over contact and email with the portal buttons and status badge on the
// right, the three-up stat strip, six section tabs, then the Details form.
export default function ClientRecordLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Line w={220} h={28} />
          <div style={{ marginTop: 10 }}><Line w={150} h={14} /></div>
          <div style={{ marginTop: 8 }}><Line w={190} h={14} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Line w={190} h={36} r={999} />
          <Line w={150} h={36} r={999} />
          <Line w={64} h={24} r={999} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 stat-strip">
        {[0, 1, 2].map((i) => (
          <div key={i} className="stat-card">
            <Line w={80} h={24} />
            <div style={{ marginTop: 10 }}><Line w={90} h={11} /></div>
          </div>
        ))}
      </div>
      <Tabs count={6} />
      <FormCard fields={8} textarea buttons={1} />
    </div>
  )
}
