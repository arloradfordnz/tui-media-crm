'use client'

import { useState } from 'react'
import { Bot, X } from 'lucide-react'
import AiChat from './AiChat'

export default function AiChatWidget() {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50" style={{ zIndex: 60 }}>
      {open && (
        <div className="mb-3 animate-fade-in" style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }}>
          <AiChat />
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="ml-auto flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all"
        style={{
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
        }}
        title={open ? 'Close AI Assistant' : 'Open AI Assistant'}
      >
        {open ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </button>
    </div>
  )
}
