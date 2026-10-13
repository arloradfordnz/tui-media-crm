import { Line, PageHeader } from '@/components/Skeleton'

// Mirrors app/dashboard/settings/page.tsx: the title, the phone-only section
// tiles, then eight stacked cards in the page's order: Profile, the sign-in
// form, retainer invoicing, the iCloud calendar and push cards, portal
// notifications, email templates, and the small App Info card at the end.
const CARDS = [
  { fields: 3 }, { fields: 3 }, { fields: 1 }, { fields: 1 },
  { fields: 2 }, { fields: 1 }, { fields: 3 }, { fields: 0 },
]

export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader />
      <div className="settings-mobile-nav">
        {Array.from({ length: 5 }).map((_, i) => <Line key={i} h={44} r={14} />)}
      </div>
      {CARDS.map((c, i) => (
        <div key={i} className="card space-y-4">
          <Line w={120} h={14} />
          {c.fields === 0 ? (
            <>
              <Line w="46%" h={12} />
              <Line w="34%" h={12} />
            </>
          ) : (
            Array.from({ length: c.fields }).map((_, k) => <Line key={k} w={k === c.fields - 1 && c.fields > 1 ? '70%' : '100%'} h={60} r={22} />)
          )}
        </div>
      ))}
    </div>
  )
}
