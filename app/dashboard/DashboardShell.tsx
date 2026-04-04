'use client'

import Sidebar from '@/components/Sidebar'
import NotificationBell from '@/components/NotificationBell'
import { logout } from '@/app/actions/auth'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
      <Sidebar onLogout={() => logout()} />

      {/* Main content area */}
      <div className="flex-1" style={{ marginLeft: 'var(--sidebar-width)' }}>
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 flex items-center justify-end px-6 py-3"
          style={{
            background: 'var(--bg-base)',
            borderBottom: '1px solid var(--bg-border)',
          }}
        >
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
