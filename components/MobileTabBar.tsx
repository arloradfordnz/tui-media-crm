'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Clapperboard, Sparkles, Repeat2, Menu } from 'lucide-react'

// The five thumb-reachable destinations. Tui sits in the centre because it is
// the fastest path to any answer — the rest of the app is where you go when you
// already know what you're looking for.
//
// Clients / Calendar / Finance / Documents / Settings are deliberately NOT here.
// They're lookups rather than daily destinations, so they live behind More,
// which opens the existing sidebar.
const TABS = [
  { href: '/dashboard', label: 'Today', icon: House, exact: true },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Clapperboard },
  { href: '/dashboard/tui', label: 'Tui', icon: Sparkles, centre: true },
  { href: '/dashboard/retainers', label: 'Retainers', icon: Repeat2 },
]

export default function MobileTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="mobile-tab-bar" aria-label="Primary">
      {TABS.map((t) => {
        const Icon = t.icon
        // '/dashboard' needs an exact match or it would light up on every child route.
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`mobile-tab${t.centre ? ' mobile-tab-centre' : ''}${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="mobile-tab-icon" />
            <span className="mobile-tab-label">{t.label}</span>
          </Link>
        )
      })}

      <button type="button" className="mobile-tab" onClick={onMore}>
        <Menu className="mobile-tab-icon" />
        <span className="mobile-tab-label">More</span>
      </button>
    </nav>
  )
}
