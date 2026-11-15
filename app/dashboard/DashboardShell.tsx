'use client'

import { useEffect, useRef, useState, createContext, useContext, ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, Sparkles } from 'lucide-react'
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
  const swipeX = useRef<number | null>(null)
  useMobileViewport()

  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenedOn(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
      <div
        className="dash-root"
        style={{ background: 'var(--bg-base)' }}
        // Swipe left anywhere while the drawer is open to close it.
        onTouchStart={(e) => { swipeX.current = sidebarOpen ? e.touches[0].clientX : null }}
        onTouchEnd={(e) => {
          if (swipeX.current !== null && e.changedTouches[0].clientX - swipeX.current < -60) closeSidebar()
          swipeX.current = null
        }}
      >

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
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
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
              aria-label="Tui AI"
            >
              <Sparkles className="w-5 h-5" />
            </Link>
          </header>

          {/* Scrollable page content — scrollbar hidden, scroll still works */}
          <div className="scroll-invisible" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
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
// Keyboard: iOS does not shrink the layout viewport when the keyboard opens.
// It slides the whole page up instead, which drags the top bar off screen,
// leaves the page parked at an offset after the keyboard closes, and hides
// whatever sits at the bottom of a 100dvh box. So the visible height is
// published as --app-h (the shell, sheets and Tui are sized from it), the page
// is pinned back to the top whenever iOS pans it, and the focused field is
// scrolled into view inside the app's own scroller instead.
function useMobileViewport() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    document.addEventListener('gesturechange', stop)

    const vv = window.visualViewport
    const touch = window.matchMedia('(pointer: coarse)').matches
    const root = document.documentElement
    let last = vv ? vv.height : 0
    let raf = 0

    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (!vv) return
        root.style.setProperty('--app-h', Math.round(vv.height) + 'px')
        if (window.scrollY !== 0 || vv.offsetTop !== 0) window.scrollTo(0, 0)
        // Only when the keyboard has just opened, not on every pan.
        if (last - vv.height > 80) {
          const el = document.activeElement
          if (el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable]')) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        }
        last = vv.height
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
