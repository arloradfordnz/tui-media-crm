'use client'

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ExternalLink, Check, AlertTriangle, ShieldAlert, Search, ListChecks, Send } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ThreadMessage } from '@/lib/tui/thread'
import { decodeEvents, type AskQuestion } from '@/lib/tui/receipts'
import AskSheet, { formatAnswers } from './AskSheet'
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
//
// A turn also survives navigation, not just the words. The conversation lives
// in a module-level store (liveStore, below), not in component state: a route
// change unmounts this component but not the module, so a reply that is still
// streaming keeps writing into the store while Arlo is on another page, and
// whichever mount is showing that conversation picks it up live. It used to
// write into an unmounted component's state, where it went nowhere, and the
// next mount restored an empty "Thinking" bubble from mid-turn.

type Receipt = { id: string; name?: string; label: string; state: 'running' | 'done' | 'failed'; detail?: string }
type LinkOut = { path: string; label: string }
type Confirm = { fingerprint: string; action: string; tone?: 'go' | 'danger' }

type Ask = { id: string; questions: AskQuestion[]; answered?: boolean }

type Message = {
  role: 'user' | 'assistant'
  content: string
  receipts?: Receipt[]
  links?: LinkOut[]
  confirms?: Confirm[]
  /** Questions Tui asked with tap-to-answer options (ask_arlo). */
  ask?: Ask
  /** What the tools returned during this turn. Never shown; sent back with the
   *  next message so Tui still knows what it read. */
  recall?: string
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
    // A turn that only asked questions has no prose, but the model still needs
    // to see what it asked, or the tapped answers arrive with no context.
    const asked = m.ask
      ? m.ask.questions.map((q) => `${q.question} (options: ${q.options.map((o) => o.label).join(' / ')})`).join('\n')
      : ''
    // What the tools returned that turn. Without it, the lookup Tui just did
    // is gone by the next question and it has to do it all again.
    const recalled = m.recall ? `[Looked up earlier in this chat, still current unless something has been changed since:\n${m.recall}]` : ''
    const content = [m.content.trim(), asked, recalled].filter(Boolean).join('\n\n')
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

// ── The live conversations ───────────────────────────────────────────────
// One per store key, for the life of the tab's JS (client-side navigation
// keeps it). Every write is mirrored to sessionStorage so a hard reload still
// gets the words back.
type Live = { messages: Message[]; loading: boolean }
const liveState = new Map<string, Live>()
const liveListeners = new Map<string, Set<() => void>>()

function liveSet(key: string, patch: Partial<Live>) {
  const next = { ...(liveState.get(key) ?? { messages: [], loading: false }), ...patch }
  liveState.set(key, next)
  if (patch.messages) writeStore(key, next.messages)
  liveListeners.get(key)?.forEach((l) => l())
}

function liveSubscribe(key: string, listener: () => void) {
  let set = liveListeners.get(key)
  if (!set) liveListeners.set(key, (set = new Set()))
  set.add(listener)
  return () => { set.delete(listener) }
}

// A saved copy from before a hard reload can end mid-turn: the request died
// with the page. Steps still spinning are marked unconfirmed, and an empty
// placeholder bubble is dropped rather than left "Thinking" forever.
function settleSaved(saved: Message[]): Message[] {
  const out = saved.map((m) =>
    m.receipts?.some((r) => r.state === 'running')
      ? { ...m, receipts: m.receipts.map((r) => (r.state === 'running' ? { ...r, state: 'failed' as const, detail: 'not confirmed, check the record' } : r)) }
      : m
  )
  const last = out[out.length - 1]
  if (last && last.role === 'assistant' && !last.content.trim() && !last.receipts?.length && !last.ask && !last.confirms?.length) out.pop()
  return out
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
  const [input, setInput] = useState('')
  const [hasChatted, setHasChatted] = useState(false)
  // The ask_arlo popup that is open, by its tool-call id.
  const [openAsk, setOpenAsk] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // An ephemeral mount is seeded by definition — with nothing.
  const seeded = ephemeral || initialThread !== undefined
  const storeKey = ephemeral ? 'panel' : 'shared'

  // What the server rendered. Also the hydration snapshot, so the first client
  // render matches the server's markup exactly.
  const [seed] = useState<Live>(() => ({ messages: toMessages(initialThread ?? []), loading: false }))

  // The live conversation for this key. Created on first client read from the
  // tab's saved copy when that is at least as long as the server's seed
  // (it is the same messages plus the receipts, links and pending approvals
  // the server thread cannot carry), else from the seed. A genuinely longer
  // server thread (something said on Telegram since) wins instead.
  const getSnapshot = useCallback((): Live => {
    let live = liveState.get(storeKey)
    if (!live) {
      const saved = readStore(storeKey)
      const settled = saved ? settleSaved(saved) : null
      live = { messages: settled && settled.length >= seed.messages.length ? settled : seed.messages, loading: false }
      liveState.set(storeKey, live)
    }
    return live
  }, [storeKey, seed])
  const subscribe = useCallback((l: () => void) => liveSubscribe(storeKey, l), [storeKey])
  const live = useSyncExternalStore(subscribe, getSnapshot, () => seed)
  const { messages, loading } = live

  // Writes go to the store, never to this component, so a turn that is still
  // streaming after a route change lands where the next mount can see it.
  function setMessages(next: Message[] | ((prev: Message[]) => Message[])) {
    const prev = getSnapshot().messages
    liveSet(storeKey, { messages: typeof next === 'function' ? next(prev) : next })
  }
  function setLoading(value: boolean) {
    liveSet(storeKey, { loading: value })
  }

  // A conversation already alive in this tab is newer than the server's copy,
  // unless the server has strictly more (Telegram), and nothing is mid-turn.
  useEffect(() => {
    const current = getSnapshot()
    if (!current.loading && seed.messages.length > current.messages.length) liveSet(storeKey, { messages: seed.messages })
  }, [getSnapshot, seed, storeKey])

  // Overlay-only: pull the shared thread once so ⌘K opens mid-conversation
  // rather than on a blank slate.
  useEffect(() => {
    if (seeded) return
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded])

  // Stay glued to the bottom of the thread. Scrolling only when `messages`
  // changed was not enough: receipts resolving, the thinking dots collapsing,
  // a confirm card or link chips appearing and fonts settling all change the
  // height AFTER that effect ran, which left the newest text just below the
  // fold. A MutationObserver re-pins on every one of those, and it stands down
  // while Arlo has deliberately scrolled up to read something older.
  const stickRef = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let frame = 0
    const pin = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (stickRef.current) el.scrollTop = el.scrollHeight
      })
    }
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const mo = new MutationObserver(pin)
    mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: true })
    pin()
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      mo.disconnect()
    }
  }, [])

  useEffect(() => {
    // A new message from Arlo always jumps to the bottom, even if he had
    // scrolled up before typing.
    if (messages[messages.length - 1]?.role === 'user') stickRef.current = true
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
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

  // A turn that dies mid-stream (the phone dropped signal, Safari suspended
  // the tab, the app went to the background) used to replace the whole bubble
  // with "Something went wrong there. Try again." — wiping the receipts for
  // work that had already saved. Tui once created a client and a job, lost the
  // connection on the final sentence, and told Arlo to try again, which would
  // have made duplicates. Now the bubble keeps everything it already showed,
  // any step still spinning is marked unconfirmed rather than left spinning
  // forever, and the note says plainly whether anything was saved.
  function settleRunningReceipts() {
    setMessages((prev) =>
      prev.map((m) =>
        m.receipts?.some((r) => r.state === 'running')
          ? {
              ...m,
              receipts: m.receipts.map((r) =>
                r.state === 'running' ? { ...r, state: 'failed', detail: 'not confirmed, check the record' } : r
              ),
            }
          : m
      )
    )
  }

  function appendNote(note: string) {
    patchLast((m) => ({ ...m, content: m.content.trim() ? `${m.content.trim()}\n\n${note}` : note }))
  }

  function interruptedNote(saved: boolean) {
    return saved
      ? "Lost the connection before I finished, but the ticked steps above went through. Don't resend it or you'll get doubles."
      : 'Lost the connection before I could finish. Try again.'
  }

  async function sendMessage(text: string, approvals: string[] = []) {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text.trim() }
    // Anything typed answers (or moves past) any question still open, so its
    // Answer button should not linger above the new turn.
    setOpenAsk(null)
    // One turn can be several bubbles here but is one assistant turn to the
    // API, which requires the roles to alternate — so consecutive bubbles are
    // rejoined before they go back out.
    const history = mergeRoles([...messages, userMsg].slice(-HISTORY_CAP))
    setMessages((prev) => [
      ...prev.map((m) => (m.ask && !m.ask.answered ? { ...m, ask: { ...m.ask, answered: true } } : m)),
      userMsg,
      { role: 'assistant', content: '' },
    ])
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

    // Saved anything this turn? Lives outside the try so the catch can see it.
    let didMutate = false

    function fail(message: string) {
      streamDone = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      // Reveal what had streamed, then add the note under it — never replace.
      if (pending) { const rest = pending; pending = ''; patchLast((m) => ({ ...m, content: m.content + rest })) }
      settleRunningReceipts()
      appendNote(message)
      if (didMutate) router.refresh()
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
      let failed: string | null = null
      let askId: string | null = null

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
                receipts: [...(m.receipts ?? []), { id: ev.id, name: ev.name, label: ev.label, state: 'running' }],
              }))
              break
            case 'tool_done':
              patchReceipt(ev.id, (r) => ({ ...r, state: ev.ok ? 'done' : 'failed', detail: ev.detail }))
              break
            case 'confirm':
              patchLast((m) => ({
                ...m,
                confirms: [...(m.confirms ?? []), { fingerprint: ev.fingerprint, action: ev.action, tone: ev.tone }],
              }))
              break
            case 'link':
              patchLast((m) => ({ ...m, links: [...(m.links ?? []), { path: ev.path, label: ev.label }] }))
              break
            case 'ask':
              patchLast((m) => ({ ...m, ask: { id: ev.id, questions: ev.questions } }))
              askId = ev.id
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
            case 'recall':
              patchLast((m) => ({ ...m, recall: ev.v }))
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
      // Questions pop straight up once the turn has finished streaming.
      if (askId) setOpenAsk(askId)
    } catch {
      // The server logs every failure it catches, and this one never reaches
      // it: the reply was cut off in transit. Almost always the connection.
      fail(interruptedNote(didMutate))
      return
    }
    setLoading(false)
  }

  // Approving is a fresh turn carrying the fingerprint. The fingerprint is
  // bound to the exact tool arguments server-side, so it can only unlock the
  // action that was actually shown here.
  // Confirming runs the parked action server-side (/api/ai/confirm) rather
  // than posting "Yes — go ahead." into the chat and hoping the model reissues
  // the identical tool call. It did not reliably do that: it would reply
  // "sending it now" as plain text, no tool ran, no receipt appeared, and the
  // invoice was never sent. The fingerprint is bound server-side to the exact
  // arguments Arlo was shown, so this can only ever run what was on the card.
  async function approve(c: Confirm) {
    if (loading) return
    setMessages((prev) => [
      ...prev.map((m) =>
        m.confirms?.some((x) => x.fingerprint === c.fingerprint)
          ? { ...m, confirms: m.confirms.filter((x) => x.fingerprint !== c.fingerprint) }
          : m
      ),
      { role: 'assistant', content: '' },
    ])
    setLoading(true)
    let didMutate = false

    try {
      const res = await fetch('/api/ai/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: c.fingerprint }),
      })

      if (!res.ok) {
        let errorMsg = 'That confirmation could not be run.'
        try {
          const data = await res.json()
          errorMsg = data.error || errorMsg
        } catch { /* not JSON */ }
        patchLast(() => ({ role: 'assistant', content: errorMsg }))
        setLoading(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = decodeEvents(buffer)
        buffer = rest

        for (const ev of events) {
          switch (ev.t) {
            case 'text':
              patchLast((m) => ({ ...m, content: m.content + ev.v }))
              break
            case 'tool':
              patchLast((m) => ({
                ...m,
                receipts: [...(m.receipts ?? []), { id: ev.id, name: ev.name, label: ev.label, state: 'running' }],
              }))
              break
            case 'tool_done':
              patchReceipt(ev.id, (r) => ({ ...r, state: ev.ok ? 'done' : 'failed', detail: ev.detail }))
              break
            case 'mutated':
              didMutate = true
              router.refresh()
              break
            case 'error':
              settleRunningReceipts()
              appendNote(ev.v)
              break
            case 'done':
              break
          }
        }
      }

      if (didMutate) router.refresh()
    } catch {
      // "Nothing was sent" was a guess, and the wrong one when the connection
      // dropped after the send had already gone out.
      settleRunningReceipts()
      appendNote(
        didMutate
          ? 'Lost the connection, but the ticked step above went through.'
          : "Lost the connection before I heard back, so I can't confirm it ran. Check the record before trying again."
      )
      router.refresh()
    }
    setLoading(false)
  }

  function answerAsk(ask: Ask, answers: string[]) {
    setMessages((prev) => prev.map((m) => (m.ask?.id === ask.id ? { ...m, ask: { ...m.ask, answered: true } } : m)))
    setOpenAsk(null)
    void sendMessage(formatAnswers(ask.questions, answers))
  }

  const openAskData = openAsk ? messages.find((m) => m.ask?.id === openAsk && !m.ask.answered)?.ask : undefined

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
      <div ref={scrollRef} className="tui-scroll flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
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

          // A turn with several rounds of tools is several bubbles, and a link
          // arrives attached to whichever one was open when the tool ran — so
          // "View September Content" used to land mid-turn, above the
          // deliverables still being added and the closing line. Links are
          // what you do once it is all finished, so they gather onto the last
          // bubble of the run of assistant messages.
          const endsRun = m.role === 'assistant' && messages[i + 1]?.role !== 'assistant'
          const runLinks: LinkOut[] = []
          if (endsRun) {
            for (let k = i; k >= 0 && messages[k].role === 'assistant'; k--) {
              for (const l of messages[k].links ?? []) {
                if (!runLinks.some((x) => x.path === l.path)) runLinks.unshift(l)
              }
            }
          }

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
                      <div className="flex items-center gap-2.5">
                        <span className="tui-orb" aria-hidden="true" />
                        <span className="text-xs tui-live-label tui-live-label--quiet" data-text="Thinking">Thinking</span>
                      </div>
                    ) : m.role === 'assistant' ? (
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) || '&#8203;' }} />
                    ) : m.content}
                  </div>
                )}

                {m.ask && (
                  <div className="tui-ask-card">
                    <ListChecks className="tui-ask-icon" aria-hidden="true" />
                    <div className="tui-ask-text">
                      <span className="tui-ask-title">
                        {m.ask.questions.length === 1 ? 'A question for you' : `${m.ask.questions.length} questions for you`}
                      </span>
                      <span className="tui-ask-sub">
                        {m.ask.questions[0].question}
                        {m.ask.questions.length > 1 ? ` and ${m.ask.questions.length - 1} more` : ''}
                      </span>
                    </div>
                    {m.ask.answered ? (
                      <span className="tui-ask-done"><Check className="w-3.5 h-3.5" /> Answered</span>
                    ) : (
                      <button type="button" className="btn-primary btn-sm" disabled={loading} onClick={() => setOpenAsk(m.ask!.id)}>
                        Answer
                      </button>
                    )}
                  </div>
                )}

                {(m.confirms ?? []).map((c) => {
                  // Green for a forward step (sending an invoice), red for
                  // anything that destroys something.
                  const go = c.tone === 'go'
                  const tone = go ? 'var(--success)' : 'var(--danger)'
                  return (
                    <div
                      key={c.fingerprint}
                      className="rounded-xl px-3.5 py-3 space-y-3"
                      style={{ background: 'var(--bg-elevated)', border: `1px solid ${tone}` }}
                    >
                      <div className="flex gap-2.5 items-start">
                        {go
                          ? <Send className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tone }} />
                          : <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tone }} />}
                        <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>{c.action}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approve(c)}
                          disabled={loading}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: tone, color: 'var(--bg-base)' }}
                        >
                          {go ? 'Send' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => dismiss(c)}
                          className="px-3.5 py-1.5 rounded-lg text-xs"
                          style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }}
                        >
                          Not now
                        </button>
                      </div>
                    </div>
                  )
                })}

                {runLinks.length > 0 && !loading && (
                  <div className="flex flex-wrap gap-1.5 justify-start">
                    {runLinks.map((link, li) => (
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

      {openAskData && (
        <AskSheet
          key={openAskData.id}
          questions={openAskData.questions}
          onSubmit={(answers) => answerAsk(openAskData, answers)}
          onClose={() => setOpenAsk(null)}
        />
      )}
    </div>
  )
}

// One line of "here is what I actually did". Reads as a log entry rather than a
// chat bubble on purpose — it is evidence, not conversation.
function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const running = receipt.state === 'running'
  const colour =
    receipt.state === 'failed' ? 'var(--danger)'
    : receipt.state === 'done' ? 'var(--text-tertiary)'
    : 'var(--accent)'

  return (
    <div className="flex items-center gap-2 text-xs tui-receipt-row" style={{ color: colour }}>
      {running && receipt.name === 'web_search' ? (
        // A lens that circles while a sonar ring pulses out from behind it.
        <span className="tui-search-icon" aria-hidden="true">
          <span className="tui-search-ring" />
          <Search className="w-3 h-3 tui-search-orbit" />
        </span>
      ) : running ? (
        <span className="tui-run-dot" aria-hidden="true" />
      ) : receipt.state === 'failed' ? (
        <AlertTriangle className="w-3 h-3 shrink-0" />
      ) : (
        <Check className="w-3 h-3 shrink-0 tui-check-pop" />
      )}
      <span className={`truncate${running ? ' tui-live-label' : ''}`} data-text={running ? receipt.label : undefined}>{receipt.label}</span>
      {receipt.detail && (
        <span className="truncate" style={{ color: 'var(--text-tertiary)', opacity: 0.75 }}>
          · {receipt.detail}
        </span>
      )}
    </div>
  )
}

