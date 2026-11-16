'use client'

import { useEffect, useRef, useState, useTransition, createContext, useContext, ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Bot, RefreshCw } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import { useMediaQuery } from '@/lib/useMediaQuery'
import AiChatWidget from '@/components/AiChatWidget'
import { ToastProvider } from '@/components/Toast'
import { logout } from '@/app/actions/auth'

// ── Panel context (Monthly Report push panel) ─────────────────
type PanelCtx = {
  panelOpen: boolean
  panelContent: ReactNode | null
  openPanel: (content: ReactNode) => void
  closePanel: () => void
}
export const PanelContext = createContext<PanelCtx | null>(null)
export function usePanelContext() {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanelContext must be inside DashboardShell')
  return ctx
}

const PANEL_W = 404 // 380px panel + 12px left margin + 12px right margin

export default function DashboardShell({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelContent, setPanelContent] = useState<ReactNode | null>(null)
  // Pinned open on desktop by CSS; on a phone it is a drawer opened from the
  // menu button in the top bar. Remembering which path it was opened on means
  // it closes itself when the route changes, with no effect needed.
  const pathname = usePathname()
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const sidebarOpen = openedOn === pathname
  const closeSidebar = () => setOpenedOn(null)
  useMobileViewport()
  useDrawerGestures(sidebarOpen, (open) => setOpenedOn(open ? pathname : null))

  useEffect(() => {
    if (!sidebarOpen) return
    // The page scrolls as the document on a phone; hold it still behind the drawer.
    document.documentElement.classList.add('drawer-open')
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenedOn(null) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.documentElement.classList.remove('drawer-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [sidebarOpen])

  // The report panel PUSHES content on desktop. On a phone there is no room to
  // push into — a 404px margin on a 390px viewport moves the page off-screen
  // entirely — so there the panel overlays instead. Matches the 768px
  // breakpoint every other rule in globals.css uses.
  const isDesktop = useMediaQuery('(min-width: 769px)')

  function openPanel(content: ReactNode) {
    setPanelContent(content)
    setPanelOpen(true)
  }
  function closePanel() {
    setPanelOpen(false)
    setPanelContent(null)
  }

  return (
    <ToastProvider>
    <PanelContext.Provider value={{ panelOpen, panelContent, openPanel, closePanel }}>
      <div className="dash-root" style={{ background: 'var(--bg-base)' }}>

        <PullToRefresh />

        <Sidebar open={sidebarOpen} onClose={closeSidebar} onLogout={() => logout()} />

        {/* Fixed report panel — slides in from the right */}
        <div
          className="report-panel"
          style={{
            transform: panelOpen ? 'translateX(0)' : `translateX(calc(100% + 24px))`,
            // Closed, the panel is parked 380px past the right edge, and iOS
            // Safari lets you pan sideways to reach it — the whole app
            // scrolled side to side on a phone because of a panel nobody had
            // open. Hidden once the slide-out finishes, shown at once on open.
            visibility: panelOpen ? 'visible' : 'hidden',
            transition: panelOpen
              ? 'transform var(--dur-panel) var(--ease-panel), visibility 0s'
              : 'transform var(--dur-panel) var(--ease-panel), visibility 0s linear var(--dur-panel)',
          }}
        >
          {panelContent}
        </div>

        {/* Main area — sidebar margin is handled by .main-area (pinned sidebar on
            desktop, overlay on mobile); the report panel margin stays dynamic */}
        <div
          className="main-area"
          style={{
            marginRight: panelOpen && isDesktop ? PANEL_W : 0,
            // The panel itself slides in CSS (.report-panel) while this margin
            // animates here, so the two must run on identical timing or the
            // page visibly tears mid-transition. Both read the same tokens.
            transition: 'margin-right var(--dur-panel) var(--ease-panel)',
          }}
        >
          {/* Phone only (hidden from 769px in CSS): menu, wordmark, Tui. */}
          <header className="mobile-top-bar">
            <button
              type="button"
              className="mobile-top-btn"
              onClick={() => setOpenedOn(pathname)}
              aria-label="Open menu"
              aria-expanded={sidebarOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/dashboard" className="mobile-top-logo" aria-label="Today">
              <Image src="/Primary_White.svg" alt="Tui Media" width={104} height={22} priority />
            </Link>
            <Link
              href="/dashboard/tui"
              className={`mobile-top-btn${pathname.startsWith('/dashboard/tui') ? ' active' : ''}`}
              aria-label="Assistant"
            >
              <Bot className="w-5 h-5" />
            </Link>
          </header>

          {/* Scrollable page content — scrollbar hidden, scroll still works */}
          <div className="main-scroll scroll-invisible">
            <div className="page-shell-inner">
              {children}
            </div>
          </div>
        </div>

        <AiChatWidget />
      </div>
    </PanelContext.Provider>
    </ToastProvider>
  )
}

// Two phone problems, fixed in one place.
//
// Zoom: iOS Safari ignores user-scalable=no in a browser tab, so the pinch is
// cancelled here (gesture* are Safari's own events) and double-tap zoom is
// removed by touch-action in globals.css.
//
// Keyboard: the visible height is published as --app-h, which sheets, modals
// and the Tui page are sized from, so they sit above the keyboard. Ordinary
// pages scroll as the document and iOS brings the focused field into view by
// itself. Only a page that fits the screen exactly (Tui) gets pinned back to
// the top, because there iOS slides the whole page up and leaves it parked.
function useMobileViewport() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    document.addEventListener('gesturechange', stop)

    const vv = window.visualViewport
    const touch = window.matchMedia('(pointer: coarse)').matches
    const root = document.documentElement
    let raf = 0

    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (!vv) return
        root.style.setProperty('--app-h', Math.round(vv.height) + 'px')
        // Only the assistant page, which is pinned to the screen. Doing this on
        // any page that happened to fit fought the rubber-band when it was
        // pulled down, which is the judder that was on the short pages.
        const pinned = document.querySelector('.tui-page') !== null
        if (pinned && (window.scrollY !== 0 || vv.offsetTop !== 0)) window.scrollTo(0, 0)
      })
    }

    if (vv && touch) {
      sync()
      vv.addEventListener('resize', sync)
      vv.addEventListener('scroll', sync)
    }
    return () => {
      document.removeEventListener('gesturestart', stop)
      document.removeEventListener('gesturechange', stop)
      cancelAnimationFrame(raf)
      if (vv && touch) {
        vv.removeEventListener('resize', sync)
        vv.removeEventListener('scroll', sync)
        root.style.removeProperty('--app-h')
      }
    }
  }, [])
}

// The menu follows the finger on a phone: drag in from the left edge to open
// it, drag it (or the dimmed page) left to close it. The panel is moved
// directly while the finger is down and handed back to the CSS transition on
// release, so it never jumps.
//
// The touch that starts at the very edge is cancelled (preventDefault needs a
// non-passive listener), because that is the same touch iOS uses for "back",
// and opening the menu must not also leave the page. A cancelled touch does
// not produce a click, so a plain tap there is passed on by hand.
const EDGE = 22
function useDrawerGestures(open: boolean, setOpen: (open: boolean) => void) {
  const live = useRef({ open, setOpen })
  useEffect(() => { live.current = { open, setOpen } })

  useEffect(() => {
    type Drag = { mode: 'open' | 'close'; x0: number; y0: number; t0: number; dx: number; active: boolean; target: EventTarget | null }
    let drag: Drag | null = null
    const panel = () => document.querySelector<HTMLElement>('.sidebar-panel')
    const scrim = () => document.querySelector<HTMLElement>('.sidebar-scrim')

    const onStart = (e: TouchEvent) => {
      if (window.innerWidth > 768 || e.touches.length !== 1) return
      const t = e.touches[0]
      const base = { x0: t.clientX, y0: t.clientY, t0: Date.now(), dx: 0, target: e.target }
      if (live.current.open) {
        drag = { ...base, mode: 'close', active: false }
      } else if (t.clientX <= EDGE && !document.querySelector('.modal-overlay, .confirm-scrim, .drawer-overlay')) {
        if (e.cancelable) e.preventDefault()
        drag = { ...base, mode: 'open', active: true }
      }
    }

    const onMove = (e: TouchEvent) => {
      const p = panel()
      if (!drag || !p) return
      const t = e.touches[0]
      const dx = t.clientX - drag.x0
      const dy = t.clientY - drag.y0
      if (!drag.active) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        // A vertical drag is the menu scrolling; a rightward one is nothing.
        if (Math.abs(dy) > Math.abs(dx) || dx > 0) { drag = null; return }
        drag.active = true
      }
      if (e.cancelable) e.preventDefault()
      drag.dx = dx
      const w = p.offsetWidth
      const x = drag.mode === 'open' ? Math.min(0, dx - w) : Math.max(-w, Math.min(0, dx))
      p.style.transition = 'none'
      p.style.visibility = 'visible'
      p.style.transform = 'translateX(' + x + 'px)'
      const s = scrim()
      if (s) { s.style.transition = 'none'; s.style.opacity = String(1 + x / w) }
    }

    const onEnd = () => {
      const d = drag
      const p = panel()
      drag = null
      if (!d || !p) return
      const moved = Math.abs(d.dx) > 6
      if (!moved) {
        // The edge touch was cancelled, so deliver the tap it would have been.
        if (d.mode === 'open' && d.target instanceof HTMLElement) {
          const el = d.target.closest<HTMLElement>('a, button, input, textarea, select, [role="button"], label') ?? d.target
          el.focus?.()
          el.click()
        }
        return
      }
      const w = p.offsetWidth
      const speed = d.dx / Math.max(1, Date.now() - d.t0) // px per ms
      const next = d.mode === 'open'
        ? d.dx > w * 0.3 || speed > 0.35
        : !(d.dx < -w * 0.3 || speed < -0.35)
      // Give the panel back to CSS: restore the transition, let the browser
      // register where the finger left it, then clear the inline position so
      // it animates to wherever the open/closed class says it belongs.
      const s = scrim()
      p.style.transition = ''
      if (s) s.style.transition = ''
      void p.offsetWidth
      p.style.transform = ''
      p.style.visibility = ''
      if (s) s.style.opacity = ''
      live.current.setOpen(next)
    }

    document.addEventListener('touchstart', onStart, { passive: false })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [])
}

// Pull down at the top of a page to reload its data, for the home-screen app,
// which has no browser toolbar and so no reload of its own. In a Safari tab
// the browser already does this, so it stays out of the way there. It only
// watches the pull (passive listeners): the page keeps its own natural bounce
// and the spinner rides down with it.
const PULL_TRIGGER = 64
function PullToRefresh() {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const [pending, startTransition] = useTransition()
  const [spinning, setSpinning] = useState(false)
  const busy = pending || spinning

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
    if (!standalone) return
    let y0: number | null = null
    let pull = 0
    const el = () => ref.current
    const set = (v: number) => {
      pull = v
      const n = el()
      if (!n) return
      n.style.transition = 'none'
      n.style.opacity = String(Math.min(1, v / 40))
      n.style.transform = 'translate(-50%, ' + v + 'px) rotate(' + v * 4 + 'deg)'
    }
    const release = () => {
      const n = el()
      if (!n) return
      n.style.transition = ''
      n.style.opacity = ''
      n.style.transform = ''
    }
    const onStart = (e: TouchEvent) => {
      y0 = null
      if (window.scrollY > 0 || e.touches.length !== 1 || e.touches[0].clientX <= EDGE) return
      if (document.querySelector('.tui-page, .sidebar-panel-open, .modal-overlay, .confirm-scrim, .drawer-overlay')) return
      // Not inside something that scrolls on its own (the Today thread).
      if (e.target instanceof Element && e.target.closest('.tui-scroll, textarea')) return
      y0 = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (y0 === null) return
      const dy = e.touches[0].clientY - y0
      if (dy <= 0 || window.scrollY > 0) { if (pull) { pull = 0; release() } return }
      set(Math.min(96, dy * 0.5))
    }
    const onEnd = () => {
      if (y0 === null) return
      y0 = null
      const go = pull >= PULL_TRIGGER
      pull = 0
      release()
      if (!go) return
      setSpinning(true)
      startTransition(() => router.refresh())
      // Long enough to be seen even when the data comes straight back.
      window.setTimeout(() => setSpinning(false), 700)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [router])

  return (
    <div ref={ref} className={`pull-refresh${busy ? ' is-busy' : ''}`} aria-hidden="true">
      <RefreshCw className="w-4 h-4" />
    </div>
  )
}
