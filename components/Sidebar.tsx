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
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
]

const businessNav = [
  { href: '/dashboard/finance', label: 'Finance', icon: DollarSign },
  { href: '/dashboard/gear', label: 'Gear', icon: Camera },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText },
]

const accountNav = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  const pathname = usePathname()
  const isActive = href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname.startsWith(href)

  return (
    <Link href={href} className={`nav-item ${isActive ? 'active' : ''}`}>
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="mobile-nav fixed top-4 left-4 z-50 btn-icon"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0 !flex' : ''
        }`}
        style={{
          width: 'var(--sidebar-width)',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--bg-border)',
        }}
      >
        {/* Mobile close */}
        <button
          className="mobile-nav absolute top-4 right-4 btn-icon"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="px-5 py-6" style={{ borderBottom: '1px solid var(--bg-border)' }}>
          <Image src="/Primary_White.svg" alt="Tui Media" width={120} height={25} style={{ height: 'auto' }} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
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

        {/* Bottom */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid var(--bg-border)' }}>
          <button onClick={onLogout} className="nav-item w-full" style={{ color: 'var(--text-secondary)' }}>
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
