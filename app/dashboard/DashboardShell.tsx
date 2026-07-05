'use client'

import { useState, createContext, useContext, ReactNode } from 'react'
import BottomNav from '@/components/BottomNav'
import AiChatWidget from '@/components/AiChatWidget'

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
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>

        {/* Fixed report panel — slides in from the right */}
        <div
          className="report-panel"
          style={{
            transform: panelOpen ? 'translateX(0)' : `translateX(calc(100% + 24px))`,
          }}
        >
          {panelContent}
        </div>

        {/* Main area — marginRight pushes away from the report panel */}
        <div
          style={{
            marginRight: panelOpen ? PANEL_W : 0,
            transition: `margin-right 240ms ${EASE}`,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
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

        <BottomNav />
        <AiChatWidget />
      </div>
    </PanelContext.Provider>
  )
}
