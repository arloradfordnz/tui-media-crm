'use client'

import { useState, useEffect, lazy, Suspense } from 'react'

const TuiThread = lazy(() => import('./TuiThread'))

// Keyboard-launched Tui: press ⌘K (or Ctrl+K) to toggle. This is the same
// assistant and the same thread as the home-screen panel and /dashboard/tui —
// it just fetches its own history, having no server parent to seed it.
export default function AiChatWidget() {
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => {
          if (!v) setHasOpened(true)
          return !v
        })
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!hasOpened) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      style={{ zIndex: 60, display: open ? 'block' : 'none' }}
    >
      <div style={{ filter: 'drop-shadow(0 10px 34px rgba(6, 13, 26, 0.55))' }}>
        <Suspense
          fallback={
            <div
              style={{
                height: 440,
                width: 360,
                background: 'var(--bg-surface)',
                borderRadius: 12,
                border: '1px solid var(--bg-border)',
              }}
            />
          }
        >
          <TuiThread variant="overlay" />
        </Suspense>
      </div>
    </div>
  )
}
