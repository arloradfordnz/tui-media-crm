'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ExternalLink, Check, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import type { ThreadMessage } from '@/lib/tui/thread'
import { decodeEvents } from '@/lib/tui/receipts'
import { renderMarkdown } from './chat-markup'

// The one Tui surface. Before this component there were two — an AiChat widget
// behind ⌘K with its own empty in-memory history, and a TuiPanel on the home
// screen seeded from the Telegram thread — so the same assistant answered
// differently depending on which box you typed into, and anything you asked
// via ⌘K was invisible to Telegram and to the next page load.
//
// There is now one component with three mounts: the Today panel, the
// /dashboard/tui page, and the ⌘K overlay. All three read and write
// sms_messages, the same table the Telegram brain uses, so it is genuinely one
// conversation.

type Receipt = { id: string; label: string; state: 'running' | 'done' | 'failed'; detail?: string }
type LinkOut = { path: string; label: string }
type Confirm = { fingerprint: string; action: string }

type Message = {
  role: 'user' | 'assistant'
  content: string
  receipts?: Receipt[]
  links?: LinkOut[]
  confirms?: Confirm[]
}

export type TuiVariant = 'panel' | 'page' | 'overlay'

const SUGGESTIONS = [
  'What needs attention today?',
  'Who owes me money?',
  "What's on this week?",
  'Which jobs are in review?',
]

// How much history to send back to the model per turn — enough for continuity,
// bounded so the payload stays small and the turn stays fast.
const HISTORY_CAP = 20

function toMessages(thread: ThreadMessage[]): Message[] {
  return thread.map((m) => ({
    role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: m.body,
  }))
}

export default function TuiThread({
  initialThread,
  variant = 'panel',
}: {
  // Server-rendered mounts pass the thread straight in. The overlay has no
  // server parent, so it passes nothing and fetches it on mount instead.
  initialThread?: ThreadMessage[]
  variant?: TuiVariant
}) {
  const [messages, setMessages] = useState<Message[]>(() => toMessages(initialThread ?? []))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasChatted, setHasChatted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const seeded = initialThread !== undefined

  // Overlay-only: pull the shared thread once so ⌘K opens mid-conversation
  // rather than on a blank slate.
  useEffect(() => {
    if (seeded) return
    let cancelled = false
    fetch('/api/ai/thread')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.thread) return
        setMessages((prev) => (prev.length > 0 ? prev : toMessages(data.thread)))
      })
      .catch(() => { /* an empty thread is a fine fallback */ })
    return () => { cancelled = true }
  }, [seeded])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Mutate only the in-flight assistant message, which is always the last one.
  function patchLast(fn: (m: Message) => Message) {
    setMessages((prev) => {
      const updated = [...prev]
      updated[updated.length - 1] = fn(updated[updated.length - 1])
      return updated
    })
  }

  async function sendMessage(text: string, approvals: string[] = []) {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text.trim() }
    const history = [...messages, userMsg]
      .slice(-HISTORY_CAP)
      .map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    setHasChatted(true)

    // Pending buffer + rAF-driven typewriter so streamed text reveals smoothly
    // instead of jumping in bursts. Only prose goes through here — receipts and
    // links apply immediately, because a receipt that lags behind the work it
    // describes is worse than no receipt.
    let pending = ''
    let streamDone = false
    let rafId: number | null = null

    const flushTick = () => {
      if (pending.length === 0) {
        if (streamDone) { rafId = null; return }
        rafId = requestAnimationFrame(flushTick)
        return
      }
      // Reveal a slice proportional to buffer size so big dumps don't lag,
      // but small chunks still animate. Floor of 2 chars/frame ≈ ~120 cps.
      const sliceLen = Math.max(2, Math.ceil(pending.length / 20))
      const emit = pending.slice(0, sliceLen)
      pending = pending.slice(sliceLen)
      patchLast((m) => ({ ...m, content: m.content + emit }))
      rafId = requestAnimationFrame(flushTick)
    }

    rafId = requestAnimationFrame(flushTick)

    function fail(message: string) {
      streamDone = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      patchLast(() => ({ role: 'assistant', content: message }))
      setLoading(false)
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, approvals }),
      })

      if (!res.ok) {
        let errorMsg = 'Something went wrong.'
        try {
          const data = await res.json()
          errorMsg = data.error || errorMsg
        } catch { /* not JSON */ }
        fail(`Error: ${errorMsg}`)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let didMutate = false
      let failed: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = decodeEvents(buffer)
        buffer = rest

        for (const ev of events) {
          switch (ev.t) {
            case 'text':
              pending += ev.v
              break
            case 'tool':
              patchLast((m) => ({
                ...m,
                receipts: [...(m.receipts ?? []), { id: ev.id, label: ev.label, state: 'running' }],
              }))
              break
            case 'tool_done':
              patchLast((m) => ({
                ...m,
                receipts: (m.receipts ?? []).map((r) =>
                  r.id === ev.id ? { ...r, state: ev.ok ? 'done' : 'failed', detail: ev.detail } : r
                ),
              }))
              break
            case 'confirm':
              patchLast((m) => ({
                ...m,
                confirms: [...(m.confirms ?? []), { fingerprint: ev.fingerprint, action: ev.action }],
              }))
              break
            case 'link':
              patchLast((m) => ({ ...m, links: [...(m.links ?? []), { path: ev.path, label: ev.label }] }))
              break
            case 'mutated':
              didMutate = true
              break
            case 'error':
              failed = ev.v
              break
            case 'done':
              break
          }
        }
      }

      streamDone = true
      if (failed) { fail(failed); return }

      // Let the typewriter drain before releasing the input.
      while (pending.length > 0) {
        await new Promise((r) => setTimeout(r, 16))
      }

      // Only invalidate server data when Tui actually wrote something.
      if (didMutate) router.refresh()
    } catch {
      fail('Something went wrong there. Try again.')
      return
    }
    setLoading(false)
  }

  // Approving is a fresh turn carrying the fingerprint. The fingerprint is
  // bound to the exact tool arguments server-side, so it can only unlock the
  // action that was actually shown here.
  function approve(c: Confirm) {
    setMessages((prev) =>
      prev.map((m) =>
        m.confirms?.some((x) => x.fingerprint === c.fingerprint)
          ? { ...m, confirms: m.confirms.filter((x) => x.fingerprint !== c.fingerprint) }
          : m
      )
    )
    sendMessage('Yes — go ahead.', [c.fingerprint])
  }

  function dismiss(c: Confirm) {
    setMessages((prev) =>
      prev.map((m) =>
        m.confirms?.some((x) => x.fingerprint === c.fingerprint)
          ? { ...m, confirms: m.confirms.filter((x) => x.fingerprint !== c.fingerprint) }
          : m
      )
    )
  }

  const containerStyle =
    variant === 'page'
      ? { height: '100%', width: '100%' }
      : variant === 'overlay'
        ? { height: 440, width: 360 }
        : { height: 420 }

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        ...containerStyle,
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-border)',
      }}
    >
      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
              Ask about jobs, clients, invoices. Same Tui as your Telegram.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1
          const receipts = m.receipts ?? []
          // Dots only while there is genuinely nothing to show yet. Once a
          // receipt exists it says more than an animation can.
          const thinking = loading && isLast && m.role === 'assistant' && !m.content && receipts.length === 0

          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] space-y-1.5">
                {receipts.length > 0 && (
                  <div className="space-y-1">
                    {receipts.map((r) => (
                      <ReceiptRow key={r.id} receipt={r} />
                    ))}
                  </div>
                )}

                {(m.content || thinking) && (
                  <div
                    className="rounded-2xl px-3.5 py-2 text-sm"
                    style={{
                      background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: m.role === 'user' ? 'var(--on-accent)' : thinking ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      borderBottomRightRadius: m.role === 'user' ? 6 : undefined,
                      borderBottomLeftRadius: m.role === 'assistant' ? 6 : undefined,
                    }}
                  >
                    {thinking ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs">Thinking</span>
                        <div className="loading-dots"><span /><span /><span /></div>
                      </div>
                    ) : m.role === 'assistant' ? (
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) || '&#8203;' }} />
                    ) : m.content}
                  </div>
                )}

                {(m.confirms ?? []).map((c) => (
                  <div
                    key={c.fingerprint}
                    className="rounded-xl px-3.5 py-3 space-y-2.5"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--danger)' }}
                  >
                    <div className="flex gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{c.action}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approve(c)}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--danger)', color: 'var(--bg-base)' }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => dismiss(c)}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }}
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                ))}

                {(m.links ?? []).length > 0 && !loading && (
                  <div className="flex flex-wrap gap-1.5 justify-start">
                    {(m.links ?? []).map((link, li) => (
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

      {/* Suggestions are an empty-state affordance, so they only appear on an
          empty thread. Stacked above forty messages of real history they were
          four rows of clutter between the conversation and the composer. */}
      {!hasChatted && messages.length === 0 && (
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

// One line of "here is what I actually did". Reads as a log entry rather than a
// chat bubble on purpose — it is evidence, not conversation.
function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const colour =
    receipt.state === 'failed' ? 'var(--danger)'
    : receipt.state === 'done' ? 'var(--text-tertiary)'
    : 'var(--accent)'

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: colour }}>
      {receipt.state === 'running' ? (
        <Loader2 className="w-3 h-3 shrink-0 tui-receipt-spin" />
      ) : receipt.state === 'failed' ? (
        <AlertTriangle className="w-3 h-3 shrink-0" />
      ) : (
        <Check className="w-3 h-3 shrink-0" />
      )}
      <span className="truncate">{receipt.label}</span>
      {receipt.detail && (
        <span className="truncate" style={{ color: 'var(--text-tertiary)', opacity: 0.75 }}>
          · {receipt.detail}
        </span>
      )}
    </div>
  )
}
