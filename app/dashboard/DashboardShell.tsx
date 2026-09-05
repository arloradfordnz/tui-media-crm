'use client'

import { useState, createContext, useContext, ReactNode } from 'react'
import Sidebar from '@/components/Sidebar'
import { useMediaQuery } from '@/lib/useMediaQuery'
import AiChatWidget from '@/components/AiChatWidget'
import MobileTabBar from '@/components/MobileTabBar'
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
  // The sidebar is pinned open on desktop via CSS and is no longer opened as a
  // drawer on mobile — the tab bar's fifth tab goes to Settings, which carries
  // the links the drawer used to. Kept as a constant rather than state so the
  // Sidebar's own API is unchanged.
  const sidebarOpen = false
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
      <div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }}>

        <Sidebar open={sidebarOpen} onClose={() => {}} onLogout={() => logout()} />

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
            // The panel itself slides in CSS (.report-panel) while this margin
            // animates here, so the two must run on identical timing or the
            // page visibly tears mid-transition. Both read the same tokens.
            transition: 'margin-right var(--dur-panel) var(--ease-panel)',
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
        <MobileTabBar />

        <AiChatWidget />
      </div>
    </PanelContext.Provider>
    </ToastProvider>
  )
}
