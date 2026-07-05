'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react'
import LiquidGlass from '@/components/liquid-glass'
import { logout } from '@/app/actions/auth'

const items = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

// The whole app's navigation: a floating pill rendered with the real
// liquid-glass-react component (genuine refractive Apple glass), fixed
// bottom-centre on every breakpoint. Replaces the old sidebar.
export default function BottomNav() {
  const pathname = usePathname()

  return (
    <LiquidGlass
      className="bottomnav-glass"
      cornerRadius={999}
      padding="6px"
      displacementScale={90}
      blurAmount={0.18}
      saturation={190}
      aberrationIntensity={2.5}
      elasticity={0.12}
      mode="standard"
      style={{ position: 'fixed', top: 'calc(100dvh - 54px)', left: '50%', zIndex: 80 }}
    >
      <nav className="glass-nav-row" aria-label="Primary">
        {items.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : item.href === '/dashboard/jobs'
              ? pathname === '/dashboard/jobs' ||
                (pathname.startsWith('/dashboard/jobs/') &&
                  !pathname.startsWith('/dashboard/jobs/templates'))
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`glass-nav-item${isActive ? ' active' : ''}`}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon />
            </Link>
          )
        })}

        <span className="glass-nav-sep" aria-hidden="true" />

        <button
          type="button"
          className="glass-nav-item"
          title="Sign out"
          aria-label="Sign out"
          onClick={() => logout()}
        >
          <LogOut />
        </button>
      </nav>
    </LiquidGlass>
  )
}
