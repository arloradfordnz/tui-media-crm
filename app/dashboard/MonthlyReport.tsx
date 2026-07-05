'use client'

import { Camera, CalendarDays, X } from 'lucide-react'
import Link from 'next/link'
import { usePanelContext } from './DashboardShell'

type Point = { label: string; value: number }
type Breakdown = { label: string; value: number; color: string }

export type UpcomingShoot = {
  clientId: string
  clientName: string
  cadence: string
  shootsPerMonth: number
  dateISO: string
  weekLabel: string
}

export type ReportData = {
  revenueThisMonth: number
  revenuePrevMonth: number
  changePct: number | undefined
  chartData: Point[]
  breakdown: Breakdown[]
  source: string
  upcomingShoots: UpcomingShoot[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A retainer shoot lands in a week of the month; show that week's range
// and how far away it is, so the panel reads as "what's coming up".
function describe(dateISO: string) {
  const start = new Date(dateISO)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const range =
    start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]}`
      : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000)
  const relative =
    days <= 0 ? 'This week'
    : days < 7 ? 'This week'
    : days < 14 ? 'Next week'
    : `In ${Math.round(days / 7)} weeks`

  return { range, relative, thisWeek: days < 7 }
}

// ── Panel content (rendered inside DashboardShell's push panel) ─
function UpcomingShootsPanel({ shoots }: { shoots: UpcomingShoot[] }) {
  const { closePanel } = usePanelContext()

  return (
    <>
      {/* Header */}
      <div className="drawer-header">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Upcoming shoots
        </h2>
        <button className="btn-icon" onClick={closePanel} aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="px-6 text-sm" style={{ color: 'var(--text-secondary)', marginTop: -4 }}>
        Retainer clients on their shoot cadence.
      </p>

      {/* Body */}
      <div className="drawer-body" style={{ flex: 1, overflowY: 'hidden' }}>
        {shoots.length === 0 ? (
          <div className="drawer-section">
            <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>
              No upcoming retainer shoots. Set a shoots-per-month on a retainer client to see their cadence here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {shoots.map((s, i) => {
              const { range, relative, thisWeek } = describe(s.dateISO)
              return (
                <div
                  key={`${s.clientId}-${s.dateISO}`}
                  className="flex items-center gap-3"
                  style={{ padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid var(--bg-border)' }}
                >
                  <span className="stat-icon-bubble bubble-sm" aria-hidden="true">
                    <Camera className="w-4 h-4" />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {s.clientName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {s.cadence} · {range}
                    </p>
                  </div>
                  <span
                    className="badge badge-sm"
                    style={{
                      background: thisWeek ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: thisWeek ? 'var(--on-accent)' : 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {relative}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="drawer-footer">
        <Link href="/dashboard/calendar" className="btn-secondary flex-1" onClick={closePanel}>
          <CalendarDays className="w-4 h-4" /> Open calendar
        </Link>
      </div>
    </>
  )
}

// ── Trigger button ─────────────────────────────────────────────
export default function MonthlyReport({ data }: { data: ReportData }) {
  const { openPanel } = usePanelContext()

  return (
    <button
      className="btn-secondary"
      onClick={() => openPanel(<UpcomingShootsPanel shoots={data.upcomingShoots} />)}
    >
      <Camera className="w-4 h-4" /> Upcoming shoots
    </button>
  )
}
