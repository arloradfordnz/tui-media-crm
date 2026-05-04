'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import AiChatWidget from '@/components/AiChatWidget'
import { logout } from '@/app/actions/auth'
import { Menu } from 'lucide-react'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
      <Sidebar onLogout={() => logout()} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 desktop-margin" style={{ marginLeft: 'var(--sidebar-width)' }}>
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 top-bar-mobile"
          style={{
            background: 'color-mix(in srgb, var(--bg-base) 80%, transparent)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="mobile-nav-toggle btn-icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Spacer for desktop (hamburger hidden) */}
          <div className="flex-1" />

          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="p-6 animate-fade-in">
          {children}
        </main>
      </div>

      <BottomNav />
      <AiChatWidget />
    </div>
  )
}
