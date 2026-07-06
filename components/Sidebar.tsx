'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  DollarSign,
  Camera,
  FileText,
  Settings,
  LogOut,
  X,
  Building2,
  CheckSquare,
  Layers,
  NotebookPen,
} from 'lucide-react'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/todos', label: 'To Do', icon: CheckSquare },
  { href: '/dashboard/notes', label: 'Notes', icon: NotebookPen },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
]

const businessNav = [
  { href: '/dashboard/finance', label: 'Finance', icon: DollarSign },
  { href: '/dashboard/gear', label: 'Gear', icon: Camera },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText },
  { href: '/dashboard/jobs/templates', label: 'Templates', icon: Layers },
]

const accountNav = [
  { href: '/dashboard/business', label: 'Business Info', icon: Building2 },
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
  const isActive =
    href === '/dashboard'
      ? pathname === '/dashboard'
      : href === '/dashboard/jobs'
      ? pathname === '/dashboard/jobs' ||
        (pathname.startsWith('/dashboard/jobs/') && !pathname.startsWith('/dashboard/jobs/templates'))
      : pathname.startsWith(href)

  return (
    <Link href={href} className={`nav-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <Icon className="w-[18px] h-[18px] shrink-0" />
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
      {/* Scrim — closes the sidebar on outside click when it's covering content (mobile) */}
      {open && (
        <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />
      )}

      {/* Sidebar — floating island, slides in/out exactly like the report panel */}
      <aside
        className="sidebar-panel"
        style={{ transform: open ? 'translateX(0)' : 'translateX(calc(-100% - 24px))' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <Image src="/Primary_Black.svg" alt="Tui Media" width={120} height={25} />
          <button className="btn-icon" onClick={onClose} aria-label="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-1 scroll-invisible">
          <div className="nav-section-label">Main</div>
          {mainNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}

          <div className="nav-section-label">Business</div>
          {businessNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}

          <div className="nav-section-label">Account</div>
          {accountNav.map((item) => (
            <NavLink key={item.href} {...item} />
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
