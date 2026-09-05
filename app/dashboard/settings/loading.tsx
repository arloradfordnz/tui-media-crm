import { Line, PageHeader } from '@/components/Skeleton'

// Mirrors app/dashboard/settings/page.tsx: header, the mobile section tiles,
// then the stacked setting cards.
export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader />
      <div className="settings-mobile-nav">
        {Array.from({ length: 5 }).map((_, i) => <Line key={i} h={44} r={14} />)}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-4">
          <Line w={120} h={14} />
          <Line h={60} r={22} />
          <Line w="70%" h={60} r={22} />
        </div>
      ))}
    </div>
  )
}
