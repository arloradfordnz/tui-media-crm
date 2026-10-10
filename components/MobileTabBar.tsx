'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Clapperboard, Sparkles, Repeat2, Settings } from 'lucide-react'
import type { CSSProperties } from 'react'

// The four thumb-reachable destinations, in a floating liquid-glass capsule,
// with Tui AI as its own round button beside it — where iOS puts Search.
// Tui sits apart because it is an action, the fastest path to any answer,
// rather than another place to go.
//
// Clients / Calendar / Finance / Documents are deliberately NOT here. They're
// lookups rather than daily destinations, so they live one level down, at the
// top of Settings.
const TABS = [
  { href: '/dashboard', label: 'Today', icon: House, exact: true },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Clapperboard },
  { href: '/dashboard/retainers', label: 'Retainers', icon: Repeat2 },
  // Settings is a real destination, so it's a Link like the rest rather than
  // a button that opens the desktop sidebar as a drawer. Clients, Calendar,
  // Money and Documents are reachable from the top of that page — see the
  // mobile nav block in app/dashboard/settings/page.tsx — so nothing lost its
  // only route in when the drawer went.
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

const TUI_HREF = '/dashboard/tui'

export default function MobileTabBar() {
  const pathname = usePathname()
  // '/dashboard' needs an exact match or it would light up on every child route.
  const activeIndex = TABS.findIndex((t) => (t.exact ? pathname === t.href : pathname.startsWith(t.href)))
  const tuiActive = pathname.startsWith(TUI_HREF)

  return (
    <nav className="mobile-tab-bar" aria-label="Primary">
      <div className="glass-pill">
        {/* One highlight that slides to the active tab; faded out on pages
            that aren't one of the four (a client record, Tui). */}
        <span
          className="glass-pill-indicator"
          aria-hidden="true"
          data-hidden={activeIndex === -1 ? '' : undefined}
          style={{ '--i': Math.max(activeIndex, 0) } as CSSProperties}
        />
        {TABS.map((t, i) => {
          const Icon = t.icon
          const active = i === activeIndex
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`mobile-tab${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="mobile-tab-icon" />
              <span className="mobile-tab-label">{t.label}</span>
            </Link>
          )
        })}
      </div>

      <Link
        href={TUI_HREF}
        className={`glass-orb${tuiActive ? ' active' : ''}`}
        aria-label="Tui AI"
        aria-current={tuiActive ? 'page' : undefined}
      >
        <Sparkles className="mobile-tab-icon" />
      </Link>
    </nav>
  )
}
