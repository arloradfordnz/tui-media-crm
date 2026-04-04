'use client'

import { Bell } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

type Notification = {
  id: string
  title: string
  message: string
  type: string
  read: boolean
  createdAt: string
  linkUrl: string | null
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.ok ? r.json() : [])
      .then(setNotifications)
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-icon relative"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center"
            style={{ background: 'var(--danger)', color: '#fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-xl z-50"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <div
                key={n.id}
                className="px-4 py-3"
                style={{
                  borderBottom: '1px solid var(--bg-border)',
                  background: n.read ? 'transparent' : 'var(--accent-muted)',
                }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(n.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
