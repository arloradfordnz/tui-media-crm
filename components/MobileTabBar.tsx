'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { House, Clapperboard, Sparkles, Repeat2, Settings } from 'lucide-react'
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'

// The four thumb-reachable destinations, in a floating liquid-glass capsule,
// with Tui AI as its own round button beside it — where iOS puts Search.
// Tui sits apart because it is an action, the fastest path to any answer,
// rather than another place to go.
//
// Clients / Calendar / Finance / Documents are deliberately NOT here. They're
// lookups rather than daily destinations, so they live one level down, at the
// top of Settings.
const TABS = [
  { href: '/dashboard', label: 'Today', icon: House, exact: true },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Clapperboard },
  { href: '/dashboard/retainers', label: 'Retainers', icon: Repeat2 },
  // Settings is a real destination, so it's a Link like the rest rather than
  // a button that opens the desktop sidebar as a drawer. Clients, Calendar,
  // Money and Documents are reachable from the top of that page — see the
  // mobile nav block in app/dashboard/settings/page.tsx — so nothing lost its
  // only route in when the drawer went.
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

const TUI_HREF = '/dashboard/tui'
const PAD = 4 // the pill's inner padding, matches .glass-pill in globals.css
const DRAG_THRESHOLD = 6

export default function MobileTabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const pillRef = useRef<HTMLDivElement>(null)

  // '/dashboard' needs an exact match or it would light up on every child route.
  const routeIndex = TABS.findIndex((t) => (t.exact ? pathname === t.href : pathname.startsWith(t.href)))
  const tuiActive = pathname.startsWith(TUI_HREF)

  // Liquid-glass interaction, as on iOS 26: pressing the bar lifts the
  // highlight into a lens, and dragging carries it under your finger, tracking
  // fractionally between tabs; letting go settles on the nearest one.
  const [pressed, setPressed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragI, setDragI] = useState<number | null>(null) // fractional while dragging
  // Held until the route catches up: it only counts while the pathname is the
  // one it was set on, so it lapses by itself once navigation lands.
  const [settled, setSettled] = useState<{ i: number; from: string } | null>(null)
  const settledI = settled && settled.from === pathname ? settled.i : null
  const start = useRef<{ x: number; id: number } | null>(null)
  const didDrag = useRef(false)

  const liveI = dragI ?? settledI ?? routeIndex
  const nearest = Math.round(Math.min(Math.max(liveI, 0), TABS.length - 1))
  const highlighted = dragging || settledI !== null ? nearest : routeIndex

  function fractionAt(clientX: number) {
    const rect = pillRef.current!.getBoundingClientRect()
    const tabW = (rect.width - PAD * 2) / TABS.length
    const i = (clientX - rect.left - PAD) / tabW - 0.5
    return Math.min(Math.max(i, 0), TABS.length - 1)
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    start.current = { x: e.clientX, id: e.pointerId }
    didDrag.current = false
    setPressed(true)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return
    if (!dragging) {
      if (Math.abs(e.clientX - start.current.x) < DRAG_THRESHOLD) return
      // Only capture once it is really a drag, so a plain tap still reaches the link.
      pillRef.current?.setPointerCapture(start.current.id)
      setDragging(true)
      didDrag.current = true
    }
    setDragI(fractionAt(e.clientX))
  }

  function finish(commit: boolean) {
    const wasDragging = dragging
    const target = dragI !== null ? Math.round(dragI) : routeIndex
    start.current = null
    setPressed(false)
    setDragging(false)
    setDragI(null)
    if (wasDragging && commit && target >= 0) {
      if (target !== routeIndex) {
        setSettled({ i: target, from: pathname })
        router.push(TABS[target].href)
      }
    }
  }

  return (
    <nav className="mobile-tab-bar" aria-label="Primary">
      <div
        ref={pillRef}
        className="glass-pill"
        data-lifted={pressed || dragging ? '' : undefined}
        data-dragging={dragging ? '' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => finish(true)}
        onPointerCancel={() => finish(false)}
        // A drag ends over the pill, not a link, so no link click fires; this
        // also swallows the click if the browser sends one anyway.
        onClickCapture={(e) => { if (didDrag.current) { e.preventDefault(); e.stopPropagation(); didDrag.current = false } }}
      >
        {/* One highlight that slides to the active tab; faded out on pages
            that aren't one of the four (a client record, Tui). */}
        <span
          className="glass-pill-indicator"
          aria-hidden="true"
          data-hidden={routeIndex === -1 && !pressed && !dragging && settledI === null ? '' : undefined}
          style={{ '--i': Math.max(liveI, 0) } as CSSProperties}
        />
        {TABS.map((t, i) => {
          const Icon = t.icon
          const active = i === highlighted
          return (
            <Link
              key={t.href}
              href={t.href}
              draggable={false}
              className={`mobile-tab${active ? ' active' : ''}`}
              aria-current={i === routeIndex ? 'page' : undefined}
            >
              <Icon className="mobile-tab-icon" />
              <span className="mobile-tab-label">{t.label}</span>
            </Link>
          )
        })}
      </div>

      <Link
        href={TUI_HREF}
        className={`glass-orb${tuiActive ? ' active' : ''}`}
        aria-label="Tui AI"
        aria-current={tuiActive ? 'page' : undefined}
      >
        <Sparkles className="mobile-tab-icon" />
      </Link>
    </nav>
  )
}
