'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Bot, User, Send, Check, Sparkles } from 'lucide-react'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const DRAFT_START = '===DRAFT START==='
const DRAFT_END = '===DRAFT END==='

function extractDraft(text: string): string | null {
  const start = text.indexOf(DRAFT_START)
  if (start === -1) return null
  const end = text.indexOf(DRAFT_END, start + DRAFT_START.length)
  if (end === -1) return null
  return text.slice(start + DRAFT_START.length, end).trim()
}

function visibleText(text: string): string {
  const start = text.indexOf(DRAFT_START)
  if (start === -1) return text
  return text.slice(0, start).trim()
}

function renderInline(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
}

export default function AIDocumentAssistant({
  open,
  onClose,
  template,
  clientName,
  businessName,
  onInsert,
}: {
  open: boolean
  onClose: () => void
  template: string
  clientName: string
  businessName: string
  onInsert: (markdown: string) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void send([])
    setTimeout(() => inputRef.current?.focus(), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Close on Escape (mobile drawer only)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function send(history: ChatMessage[]) {
    setError(null)
    setStreaming(true)
    const seeded = history.length === 0
      ? [{ role: 'user' as const, content: 'Help me draft this. Ask your first question.' }]
      : history
    if (history.length === 0) setMessages(seeded)

    try {
      const res = await fetch('/api/ai/document-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, messages: seeded, clientName, businessName }),
      })
      if (!res.ok || !res.body) {
        setError('AI request failed.')
        setStreaming(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      setMessages((m) => [...m, { role: 'assistant', content: '' }])
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
        setMessages((m) => {
          const next = [...m]
          next[next.length - 1] = { role: 'assistant', content: assistantText }
          return next
        })
      }
    } catch (err) {
      console.error('AI stream error:', err)
      setError('AI request failed.')
    }
    setStreaming(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    void send(next)
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const draft = lastAssistant ? extractDraft(lastAssistant.content) : null
  const visibleMessages = messages.filter(
    (m, i) => !(m.role === 'user' && i === 0 && m.content.startsWith('Help me draft this'))
  )

  return (
    <>
      {/* Backdrop — mobile drawer only */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Panel — mobile: slide-in drawer; desktop: sticky rounded card */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] flex flex-col transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        } lg:translate-x-0 lg:pointer-events-auto lg:inset-y-auto lg:top-[80px] lg:bottom-[96px] lg:right-6 lg:w-[420px] lg:rounded-xl lg:overflow-hidden lg:z-30`}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}
        role="complementary"
        aria-label="AI draft assistant"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--bg-border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              AI Draft Assistant
            </span>
            <span className="badge badge-muted shrink-0">{template}</span>
          </div>
          <button onClick={onClose} className="btn-icon lg:!hidden" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {visibleMessages.length === 0 && (
            <div
              className="flex flex-col items-center justify-center h-full text-center"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Bot className="w-8 h-8 mb-2" />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Starting your draft...
              </p>
            </div>
          )}

          {visibleMessages.map((m, i) => {
            const text = m.role === 'assistant' ? visibleText(m.content) : m.content
            const isLastAssistant =
              streaming &&
              m.role === 'assistant' &&
              i === visibleMessages.length - 1
            const isEmpty = isLastAssistant && !text

            return (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role === 'assistant' && (
                  <div
                    className="avatar avatar-sm shrink-0"
                    style={{ background: 'var(--accent-muted)' }}
                  >
                    <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  </div>
                )}
                <div className="max-w-[80%]">
                  <div
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{
                      background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                      color:
                        m.role === 'user'
                          ? '#fff'
                          : isEmpty
                          ? 'var(--text-tertiary)'
                          : 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {isEmpty ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs">Thinking</span>
                        <div className="loading-dots">
                          <span /><span /><span />
                        </div>
                      </div>
                    ) : m.role === 'assistant' ? (
                      <span dangerouslySetInnerHTML={{ __html: renderInline(text) || '&#8203;' }} />
                    ) : (
                      text || '\u200B'
                    )}
                  </div>
                </div>
                {m.role === 'user' && (
                  <div
                    className="avatar avatar-sm shrink-0"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <User className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  </div>
                )}
              </div>
            )
          })}

          {error && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>

        {/* Draft ready banner */}
        {draft && (
          <div
            className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            style={{ background: 'var(--accent-muted)', borderTop: '1px solid var(--bg-border)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
              Draft ready
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onInsert(draft)
                  onClose()
                }}
                className="btn-primary text-xs"
                style={{ padding: '6px 10px' }}
              >
                <Check className="w-3.5 h-3.5" /> Insert into document
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-3" style={{ borderTop: '1px solid var(--bg-border)' }}>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={streaming ? 'Thinking...' : 'Type your answer...'}
              className="field-input flex-1 text-sm"
              disabled={streaming}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="btn-primary"
              style={{ padding: '8px 12px' }}
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
