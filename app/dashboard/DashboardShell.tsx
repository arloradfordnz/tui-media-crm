'use client'

import { useState, createContext, useContext, ReactNode } from 'react'
import Sidebar from '@/components/Sidebar'
import { useMediaQuery } from '@/lib/useMediaQuery'
import AiChatWidget from '@/components/AiChatWidget'
import MobileTabBar from '@/components/MobileTabBar'
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
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

export default function DashboardShell({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelContent, setPanelContent] = useState<ReactNode | null>(null)
  // Only meaningful on mobile — on desktop the sidebar is pinned open via CSS.
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
    <PanelContext.Provider value={{ panelOpen, panelContent, openPanel, closePanel }}>
      <div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }}>

        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={() => logout()}
        />

        {/* Fixed report panel — slides in from the right */}
        <div
          className="report-panel"
          style={{
            transform: panelOpen ? 'translateX(0)' : `translateX(calc(100% + 24px))`,
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
            transition: `margin-right 240ms ${EASE}`,
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Scrollable page content — scrollbar hidden, scroll still works */}
          <div className="scroll-invisible" style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            <div className="page-shell-inner">
              {children}
            </div>
          </div>
        </div>

        {/* Mobile-only; hidden at >=769px in CSS where the sidebar is pinned. */}
        <MobileTabBar onMore={() => setSidebarOpen(true)} />

        <AiChatWidget />
      </div>
    </PanelContext.Provider>
  )
}
