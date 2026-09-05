'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Clapperboard, Sparkles, Repeat2, Settings } from 'lucide-react'

// The five thumb-reachable destinations. Tui sits in the centre because it is
// the fastest path to any answer — the rest of the app is where you go when you
// already know what you're looking for.
//
// Clients / Calendar / Finance / Documents are deliberately NOT here. They're
// lookups rather than daily destinations, so they live one level down, at the
// top of Settings.
const TABS = [
  { href: '/dashboard', label: 'Today', icon: House, exact: true },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Clapperboard },
  { href: '/dashboard/tui', label: 'Tui', icon: Sparkles, centre: true },
  { href: '/dashboard/retainers', label: 'Retainers', icon: Repeat2 },
  // Settings is a real destination, so it's a Link like the rest rather than
  // a button that opens the desktop sidebar as a drawer. Clients, Calendar,
  // Money and Documents are reachable from the top of that page — see the
  // mobile nav block in app/dashboard/settings/page.tsx — so nothing lost its
  // only route in when the drawer went.
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function MobileTabBar() {
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
    </nav>
  )
}
