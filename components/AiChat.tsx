'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Trash2, Bot, User } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string }

export default function AiChat({ fullPage = false }: { fullPage?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (data.message) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message }])
      } else if (data.error) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    }
    setLoading(false)
  }

  function handleClear() {
    setMessages([])
  }

  const containerStyle = fullPage
    ? { height: 'calc(100vh - 120px)' }
    : { height: '400px', width: '340px' }

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        ...containerStyle,
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--bg-border)' }}>
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Assistant</span>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="btn-icon" title="Clear conversation">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ color: 'var(--text-tertiary)' }}>
            <Bot className="w-8 h-8 mb-2" />
            <p className="text-sm">How can I help with Tui Media today?</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="avatar avatar-sm shrink-0" style={{ background: 'var(--accent-muted)' }}>
                <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              </div>
            )}
            <div
              className="max-w-[80%] rounded-lg px-3 py-2 text-sm"
              style={{
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="avatar avatar-sm shrink-0" style={{ background: 'var(--bg-elevated)' }}>
                <User className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="avatar avatar-sm shrink-0" style={{ background: 'var(--accent-muted)' }}>
              <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid var(--bg-border)' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="field-input flex-1 text-sm"
            disabled={loading}
          />
          <button type="submit" disabled={!input.trim() || loading} className="btn-primary" style={{ padding: '8px 12px' }}>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
