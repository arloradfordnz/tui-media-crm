'use client'

import { useState, lazy, Suspense } from 'react'
import { Bot, X } from 'lucide-react'

const AiChat = lazy(() => import('./AiChat'))

export default function AiChatWidget() {
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)

  function toggle() {
    if (!hasOpened) setHasOpened(true)
    setOpen(!open)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50" style={{ zIndex: 60 }}>
      {hasOpened && (
        <div className="mb-3 animate-fade-in" style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))', display: open ? 'block' : 'none' }}>
          <Suspense fallback={<div style={{ height: 400, width: 340, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--bg-border)' }} />}>
            <AiChat />
          </Suspense>
        </div>
      )}
      <button
        onClick={toggle}
        className="ml-auto flex items-center justify-center w-12 h-12 rounded-full shadow-lg"
        style={{
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          transition: 'transform 100ms ease',
        }}
        title={open ? 'Close AI Assistant' : 'Open AI Assistant'}
      >
        {open ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </button>
    </div>
  )
}
