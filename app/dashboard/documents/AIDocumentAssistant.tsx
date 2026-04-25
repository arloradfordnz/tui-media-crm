'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Send, Check } from 'lucide-react'

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
  const startedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    if (startedRef.current) return
    startedRef.current = true
    void send([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) {
      startedRef.current = false
      setMessages([])
      setInput('')
      setError(null)
    }
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(history: ChatMessage[]) {
    setError(null)
    setStreaming(true)
    // Seed the first turn with a user prompt so the assistant kicks things off.
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

  if (!open) return null

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const draft = lastAssistant ? extractDraft(lastAssistant.content) : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[560px] sm:max-w-[92vw] h-[85vh] sm:h-[80vh] sm:rounded-xl flex flex-col"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Draft Assistant</h3>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{template}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((m, i) => {
            const text = m.role === 'assistant' ? visibleText(m.content) : m.content
            if (!text && m.role === 'assistant' && !streaming) return null
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                  style={
                    m.role === 'user'
                      ? { background: 'var(--accent)', color: '#fff' }
                      : { background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
                  }
                >
                  {text || (streaming && m.role === 'assistant' ? '...' : '')}
                </div>
              </div>
            )
          })}
          {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        {draft && (
          <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Draft ready</p>
            <div className="flex gap-2">
              <button
                onClick={() => { onInsert(draft); onClose() }}
                className="btn-primary text-sm"
              >
                <Check className="w-4 h-4" /> Insert into document
              </button>
              <button onClick={onClose} className="btn-secondary text-sm">Discard</button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={streaming ? 'Thinking...' : 'Type your answer...'}
            disabled={streaming}
            className="field-input flex-1"
          />
          <button type="submit" disabled={streaming || !input.trim()} className="btn-primary px-3 py-2">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
