'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  House,
  Users,
  Clapperboard,
  CalendarDays,
  Wallet,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: House },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Clapperboard },
  { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
]

const businessNav = [
  { href: '/dashboard/finance', label: 'Finance', icon: Wallet },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText },
]

const accountNav = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function NavLink({
  href,
  label,
  icon: Icon,
  onClick,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick?: () => void
}) {
  const pathname = usePathname()
  const isActive = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <Link href={href} className={`nav-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <Icon className="nav-item-icon" />
      <span>{label}</span>
    </Link>
  )
}

export default function Sidebar({
  open,
  onClose,
  onLogout,
}: {
  open: boolean
  onClose: () => void
  onLogout: () => void
}) {
  return (
    <>
      {/* Scrim — closes the sidebar on outside click on mobile (hidden on desktop via CSS) */}
      {open && (
        <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />
      )}

      {/* Sidebar — pinned open on desktop; slides in/out on mobile */}
      <aside className={`sidebar-panel ${open ? 'sidebar-panel-open' : ''}`}>
        <div className="flex items-center px-5 pt-5 pb-3">
          <span className="sidebar-logo">
            <Image className="sidebar-logo-light" src="/Primary_Black.svg" alt="Tui Media" width={120} height={25} />
            <Image className="sidebar-logo-dark" src="/Primary_White.svg" alt="Tui Media" width={120} height={25} />
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-1 scroll-invisible">
          <div className="nav-section-label">Main</div>
          {mainNav.map((item) => (
            <NavLink key={item.href} {...item} onClick={onClose} />
          ))}

          <div className="nav-section-label">Business</div>
          {businessNav.map((item) => (
            <NavLink key={item.href} {...item} onClick={onClose} />
          ))}

          <div className="nav-section-label">Account</div>
          {accountNav.map((item) => (
            <NavLink key={item.href} {...item} onClick={onClose} />
          ))}
        </nav>

        <div className="px-3 pb-3 pt-2">
          <button
            onClick={onLogout}
            className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 'var(--r-pill)' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
