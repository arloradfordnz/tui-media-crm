'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Trash2, Bot, User, Plus, Search, CalendarDays, BarChart3, ExternalLink } from 'lucide-react'
import Link from 'next/link'

type Message = { role: 'user' | 'assistant'; content: string }

const QUICK_ACTIONS = [
  { label: 'New Client', icon: Plus, prompt: 'Create a new client called ' },
  { label: 'New Job', icon: Plus, prompt: 'Create a new job called ' },
  { label: 'Find Client', icon: Search, prompt: 'Search for client ' },
  { label: "Today's Schedule", icon: CalendarDays, prompt: "What's on my schedule today?" },
  { label: 'Dashboard Stats', icon: BarChart3, prompt: 'Show me a quick overview of how the business is going' },
  { label: 'Jobs in Review', icon: Search, prompt: 'Which jobs are currently in review?' },
]

// Parse [[LINK:path|label]] markers from message content
function parseLinks(content: string): { text: string; links: { path: string; label: string }[] } {
  const links: { path: string; label: string }[] = []
  const text = content.replace(/\[\[LINK:([^|]+)\|([^\]]+)\]\]/g, (_, path, label) => {
    links.push({ path: path.trim(), label: label.trim() })
    return ''
  }).trim()
  return { text, links }
}

// Strip working markers from display text
function cleanContent(content: string): string {
  return content.replace(/\[\[WORKING\]\]/g, '').replace(/\[\[\/WORKING\]\]/g, '').trim()
}

// Check if the message is currently in a working state (tool execution)
function isWorking(content: string): boolean {
  const lastWorking = content.lastIndexOf('[[WORKING]]')
  const lastDone = content.lastIndexOf('[[/WORKING]]')
  return lastWorking > lastDone
}

export default function AiChat({ fullPage = false }: { fullPage?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages([...newMessages, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok) {
        let errorMsg = 'Something went wrong.'
        try {
          const data = await res.json()
          errorMsg = data.error || errorMsg
        } catch { /* not JSON */ }
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${errorMsg}` }
          return updated
        })
        setLoading(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, content: last.content + chunk }
          return updated
        })
      }

      router.refresh()
    } catch {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }
        return updated
      })
    }
    setLoading(false)
  }

  function handleQuickAction(action: typeof QUICK_ACTIONS[number]) {
    if (action.prompt.endsWith(' ')) {
      setInput(action.prompt)
      inputRef.current?.focus()
    } else {
      sendMessage(action.prompt)
    }
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
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>How can I help?</p>
            <div className="flex flex-wrap gap-1.5 mt-4 justify-center px-2">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => handleQuickAction(a)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--bg-border)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bg-border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <a.icon className="w-3 h-3" />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const isLastAssistant = loading && i === messages.length - 1 && m.role === 'assistant'
          const isEmpty = !m.content
          const currentlyWorking = isLastAssistant && (isEmpty || isWorking(m.content))
          const { text: displayText, links } = m.role === 'assistant' ? parseLinks(cleanContent(m.content)) : { text: m.content, links: [] }

          return (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="avatar avatar-sm shrink-0" style={{ background: 'var(--accent-muted)' }}>
                  <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
              )}
              <div className="max-w-[80%] space-y-2">
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: m.role === 'user' ? '#fff' : currentlyWorking ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {currentlyWorking ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{isEmpty ? 'Thinking' : 'Working on it'}</span>
                      <div className="loading-dots">
                        <span /><span /><span />
                      </div>
                    </div>
                  ) : displayText || '\u200B'}
                </div>
                {/* Link buttons for created entities */}
                {links.length > 0 && !loading && (
                  <div className="flex flex-wrap gap-1.5">
                    {links.map((link, li) => (
                      <Link
                        key={li}
                        href={link.path}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{
                          background: 'var(--accent)',
                          color: '#fff',
                        }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {m.role === 'user' && (
                <div className="avatar avatar-sm shrink-0" style={{ background: 'var(--bg-elevated)' }}>
                  <User className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </div>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid var(--bg-border)' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input) }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
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
