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
  Bot,
  Building2,
  Mail,
  CheckSquare,
  Activity,
  Layers,
  BarChart3,
} from 'lucide-react'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/todos', label: 'To Do', icon: CheckSquare },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/ai', label: 'AI Assistant', icon: Bot },
]

const businessNav = [
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/finance', label: 'Finance', icon: DollarSign },
  { href: '/dashboard/gear', label: 'Gear', icon: Camera },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText },
  { href: '/dashboard/jobs/templates', label: 'Templates', icon: Layers },
  { href: '/dashboard/activity', label: 'Activity', icon: Activity },
  { href: '/dashboard/emails', label: 'Email Log', icon: Mail },
]

const accountNav = [
  { href: '/dashboard/business', label: 'Business Info', icon: Building2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname.startsWith(href)

  return (
    <Link href={href} className={`nav-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

export default function Sidebar({ onLogout, mobileOpen, onClose }: { onLogout: () => void; mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={onClose}
        />
      )}

      {/* Sidebar — floating island */}
      <aside
        className={`sidebar sidebar-island fixed z-50 flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'sidebar-open' : ''
        }`}
        style={{
          width: 'calc(var(--sidebar-width) - var(--sidebar-inset) * 2)',
          top: 'var(--sidebar-inset)',
          left: 'var(--sidebar-inset)',
          height: 'calc(100vh - var(--sidebar-inset) * 2)',
        }}
      >
        {/* Mobile close */}
        <button
          className="mobile-nav absolute top-4 right-4 btn-icon"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="px-5 pt-5 pb-3">
          <Image src="/Primary_White.svg" alt="Tui Media" width={120} height={26} style={{ height: 'auto' }} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-hidden px-3 pb-1">
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

        {/* Bottom */}
        <div className="px-3 pb-3 pt-2">
          <button
            onClick={onLogout}
            className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
