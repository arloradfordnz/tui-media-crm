'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { parseLinks, cleanContent, isWorking, renderMarkdown } from '@/components/chat-markup'

// Tui on the home screen — the same assistant that texts Arlo on Telegram,
// same persona, same tools, same thread. The panel is seeded with the recent
// sms_messages history (both surfaces write to it), so the conversation picks
// up exactly where the last text left off.

type ThreadMessage = { direction: 'inbound' | 'outbound'; body: string; created_at: string }
type Message = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'What needs attention today?',
  'Who owes me money?',
  "What's on this week?",
]

// How much history to send back to the model per turn — enough for
// continuity, bounded so the payload stays small and the turn stays fast.
const HISTORY_CAP = 20

export default function TuiPanel({ initialThread }: { initialThread: ThreadMessage[] }) {
  const [messages, setMessages] = useState<Message[]>(() =>
    initialThread.map((m) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.body,
    }))
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasChatted, setHasChatted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text.trim() }
    const history = [...messages, userMsg].slice(-HISTORY_CAP)
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    setHasChatted(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
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
      let didMutate = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (chunk.includes('[[MUTATED]]')) didMutate = true
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, content: last.content + chunk }
          return updated
        })
      }

      // Only invalidate server data when Tui actually wrote something.
      if (didMutate) router.refresh()
    } catch {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong there. Try again.' }
        return updated
      })
    }
    setLoading(false)
  }

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        height: 420,
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-border)',
      }}
    >
      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Ask about jobs, clients, invoices. Same Tui as your Telegram.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const isLastAssistant = loading && i === messages.length - 1 && m.role === 'assistant'
          const isEmpty = !m.content
          const currentlyWorking = isLastAssistant && (isEmpty || isWorking(m.content))
          const { text: displayText, links } = m.role === 'assistant'
            ? parseLinks(cleanContent(m.content))
            : { text: m.content, links: [] }

          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[75%] space-y-1.5">
                <div
                  className="rounded-2xl px-3.5 py-2 text-sm"
                  style={{
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: m.role === 'user' ? 'var(--on-accent)' : currentlyWorking ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    borderBottomRightRadius: m.role === 'user' ? 6 : undefined,
                    borderBottomLeftRadius: m.role === 'assistant' ? 6 : undefined,
                  }}
                >
                  {currentlyWorking ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{isEmpty ? 'Thinking' : 'Working on it'}</span>
                      <div className="loading-dots"><span /><span /><span /></div>
                    </div>
                  ) : m.role === 'assistant' ? (
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) || '&#8203;' }} />
                  ) : displayText || '​'}
                </div>
                {links.length > 0 && !loading && (
                  <div className="flex flex-wrap gap-1.5 justify-start">
                    {links.map((link, li) => (
                      <Link
                        key={li}
                        href={link.path}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Suggestions — only until the first message of this session */}
      {!hasChatted && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="px-2.5 py-1.5 rounded-full text-xs transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--bg-border)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bg-border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--bg-border)' }}>
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input) }} className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Tui..."
            className="field-input flex-1 text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="btn-primary"
            style={{ padding: '8px 10px', borderRadius: 999 }}
            aria-label="Send"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
