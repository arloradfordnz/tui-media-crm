'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ExternalLink, Check, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useMounted } from '@/lib/useMounted'
import type { ThreadMessage } from '@/lib/tui/thread'
import { decodeEvents } from '@/lib/tui/receipts'
import { renderMarkdown } from './chat-markup'

// The one Tui surface. Before this component there were two — an AiChat widget
// behind ⌘K with its own empty in-memory history, and a TuiPanel on the home
// screen seeded from the Telegram thread — so the same assistant answered
// differently depending on which box you typed into, and anything you asked
// via ⌘K was invisible to Telegram and to the next page load.
//
// There is now one component with three mounts, and two behaviours:
//
//  - **/dashboard/tui and the ⌘K overlay** read and write sms_messages, the
//    same table the Telegram brain uses, so those two and Telegram are
//    genuinely one continuous conversation.
//  - **The Today panel is a scratch pad.** Nothing said in it is written to
//    the shared thread. It is the box you use to ask a quick question while
//    looking at the dashboard, and a quick question does not belong in the
//    middle of a Telegram conversation. The trade is real and deliberate:
//    Telegram will not know what was asked here, so anything worth
//    remembering should be asked on the Tui AI page.
//
// Every mount survives navigation. A client component unmounts when you leave
// the route, so the panel used to lose a conversation the moment you clicked
// through to the job it was about, and the two shared mounts came back with
// the words but without their receipts or their approve buttons. State is
// mirrored into sessionStorage instead: it outlives a route change and a hard
// reload, it is per tab, and it is gone when the tab closes, which is exactly
// the lifetime a scratch pad should have.

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

// Per-tab conversation memory. Two keys, because the two behaviours are two
// conversations: the shared thread (the Tui AI page and the ⌘K overlay, which
// Telegram also writes into) and the dashboard scratch pad. sessionStorage,
// not localStorage, so closing the tab is still a clean slate.
const STORE_PREFIX = 'tui-thread:'
// Bounded: receipts make a message fat and sessionStorage throws when it fills.
// Only the tail is worth keeping anyway.
const STORE_CAP = 60

function readStore(key: string): Message[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Message[]) : null
  } catch {
    return null
  }
}

function writeStore(key: string, messages: Message[]) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify(messages.slice(-STORE_CAP)))
  } catch {
    // Quota, or a browser with storage switched off. Losing the mirror is not
    // worth taking the chat down for.
  }
}

// Collapse consecutive same-role messages into one. The thread can hold
// several assistant bubbles in a row now, and the Messages API requires the
// roles to alternate.
function mergeRoles(msgs: Message[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of msgs) {
    const content = m.content.trim()
    if (!content) continue
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content += `\n\n${content}`
    else out.push({ role: m.role, content })
  }
  return out
}

function toMessages(thread: ThreadMessage[]): Message[] {
  return thread.map((m) => ({
    role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: m.body,
  }))
}

export default function TuiThread({
  initialThread,
  variant = 'panel',
  ephemeral = false,
  fill = false,
}: {
  // Server-rendered mounts pass the thread straight in. The overlay has no
  // server parent, so it passes nothing and fetches it on mount instead.
  initialThread?: ThreadMessage[]
  variant?: TuiVariant
  /**
   * Keep this conversation out of the shared Telegram thread entirely: start
   * empty, and tell the server not to log either side of it. Used by the
   * dashboard panel.
   */
  ephemeral?: boolean
  /**
   * Stretch to whatever the parent gives it instead of the panel's default
   * 420px. The dashboard uses this to run the chat down the full height of
   * its column — a composer that stops halfway down the screen reads as a
   * widget you glance at rather than something you type into.
   */
  fill?: boolean
}) {
  const [messages, setMessages] = useState<Message[]>(() => toMessages(initialThread ?? []))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasChatted, setHasChatted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // An ephemeral mount is seeded by definition — with nothing.
  const seeded = ephemeral || initialThread !== undefined
  const storeKey = ephemeral ? 'panel' : 'shared'

  // Restore whatever this tab was last saying.
  //
  // Not in the useState initialiser and not in an effect. This component is
  // server-rendered, so reading sessionStorage during the hydration render
  // would give the client different markup from the server's; doing it in an
  // effect paints the empty thread for a frame first and is the cascading
  // setState the lint rule is about. useMounted() is false through hydration
  // and true from the render after it (lib/useMounted.ts), so this adjusts
  // state during render exactly once, on the client, before anything paints.
  //
  // The saved copy wins over the server-seeded one when it is at least as
  // long, because it is the same messages plus the receipts, links and pending
  // approvals the server thread cannot carry. A genuinely longer server thread
  // (something said on Telegram since) wins instead.
  const mounted = useMounted()
  const [restored, setRestored] = useState(false)
  if (mounted && !restored) {
    setRestored(true)
    const saved = readStore(storeKey)
    if (saved && saved.length >= messages.length) {
      setMessages(saved)
      setHasChatted(true)
    }
  }

  // Overlay-only: pull the shared thread once so ⌘K opens mid-conversation
  // rather than on a blank slate.
  useEffect(() => {
    if (seeded || !restored) return
    let cancelled = false
    fetch('/api/ai/thread')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.thread) return
        const fetched = toMessages(data.thread)
        setMessages((prev) => (fetched.length > prev.length ? fetched : prev))
      })
      .catch(() => { /* an empty thread is a fine fallback */ })
    return () => { cancelled = true }
  }, [seeded, restored])

  // Mirror every change back out. Guarded on `restored` so the first render's
  // seed cannot overwrite a longer saved conversation before it is read.
  useEffect(() => {
    if (!restored) return
    writeStore(storeKey, messages)
  }, [messages, restored, storeKey])

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

  // A turn can now span several bubbles (see the segmenting note in
  // sendMessage), so a receipt finishing does not necessarily belong to the
  // last one. Find the message that actually carries that id and patch there.
  function patchReceipt(id: string, fn: (r: Receipt) => Receipt) {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        const receipts = prev[i].receipts
        if (!receipts?.some((r) => r.id === id)) continue
        const updated = [...prev]
        updated[i] = { ...prev[i], receipts: receipts.map((r) => (r.id === id ? fn(r) : r)) }
        return updated
      }
      return prev
    })
  }

  async function sendMessage(text: string, approvals: string[] = []) {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text.trim() }
    // One turn can be several bubbles here but is one assistant turn to the
    // API, which requires the roles to alternate — so consecutive bubbles are
    // rejoined before they go back out.
    const history = mergeRoles([...messages, userMsg].slice(-HISTORY_CAP))
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

    // ── One turn, several messages ────────────────────────────────────────
    // Tui used to answer in a single bubble with every receipt stacked above
    // it, so a turn that looked up three things showed nothing at all until
    // the work was finished and then dropped the lot in at once. What it says
    // before it reaches for a tool is a real message ("looking for that job
    // now"), and what it says afterwards is a different one — the answer.
    //
    // So a segment is closed the moment a tool is announced AFTER some text
    // has been written, and the receipts plus everything said after them go
    // into a fresh bubble. Several rounds of tools make several bubbles, in
    // the order the work actually happened.
    let segmentHasText = false

    // Reveal everything still buffered right now. Needed before closing a
    // segment: text already streamed belongs to the bubble it was written
    // into, not the one about to be opened.
    const flushPendingNow = () => {
      if (pending.length === 0) return
      const rest = pending
      pending = ''
      patchLast((m) => ({ ...m, content: m.content + rest }))
    }

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
        body: JSON.stringify({ messages: history, approvals, persist: !ephemeral }),
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
              segmentHasText = true
              break
            case 'tool':
              if (segmentHasText) {
                flushPendingNow()
                setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
                segmentHasText = false
              }
              patchLast((m) => ({
                ...m,
                receipts: [...(m.receipts ?? []), { id: ev.id, label: ev.label, state: 'running' }],
              }))
              break
            case 'tool_done':
              patchReceipt(ev.id, (r) => ({ ...r, state: ev.ok ? 'done' : 'failed', detail: ev.detail }))
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
              // Refresh the moment the write lands rather than waiting for the
              // turn to finish. The page behind this panel is the thing Arlo
              // is looking at, and a job that has already moved should not
              // still read "review" while Tui types a sentence about it.
              // router.refresh() is a no-op on unchanged output, so the
              // occasional second call in one turn costs nothing visible.
              didMutate = true
              router.refresh()
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

      // One more at the end: the mid-turn refresh above can land before a
      // later write in the same turn does.
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
        : fill
          ? { height: '100%', minHeight: 0 }
          : { height: 420 }

  return (
    <div
      className="tui-shell"
      style={{
        ...containerStyle,
        /* The overlay floats over the page, so it keeps a hairline to separate
           it from whatever is behind. The panel and the page do not float and
           follow the card rules: surface fill, no border, no shadow. */
        ...(variant === 'overlay' ? { border: '1px solid var(--glass-card-border)' } : null),
      }}
    >
      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {messages.length === 0 && (
          /* The mark alone. An empty chat is the one place in the app with
             room for it, and it says whose assistant this is faster than a
             sentence does. Dimmed well back so it reads as a watermark behind
             the composer rather than as content waiting to be clicked. */
          <div className="tui-empty">
            <Image
              src="/Logomark_White.svg"
              alt=""
              width={44}
              height={74}
              className="tui-empty-mark"
              aria-hidden="true"
              priority={false}
            />
            <p className="tui-empty-text">
              {ephemeral
                ? 'Ask about jobs, clients or invoices. This one starts fresh each time.'
                : 'Ask about jobs, clients or invoices. Same thread as your Telegram.'}
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
            <button key={s} onClick={() => sendMessage(s)} className="suggestion-chip">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer.
          The send button is sized off the field rather than off the button
          scale. btn-sm is 36px and .field-input is 12px of padding around a
          16px line, so the two never lined up: a round 36px button sat inside
          a 46px field with 5px of dead space above and below it. Both now read
          their height from one variable, so they are the same control height
          by construction. */}
      <div className="tui-composer">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input) }} className="tui-composer-row">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Tui AI..."
            className="field-input tui-composer-input"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="btn-primary tui-composer-send"
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

