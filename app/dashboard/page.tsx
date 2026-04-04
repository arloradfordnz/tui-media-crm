import { db } from '@/lib/db'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import { Briefcase, Clock, DollarSign, Users, CalendarDays, Activity } from 'lucide-react'
import Link from 'next/link'

const JOB_PIPELINE = ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'delivered', 'archived']
const PIPELINE_COLORS: Record<string, string> = {
  enquiry: 'var(--accent)',
  booked: 'var(--accent-hover)',
  preproduction: 'var(--warning)',
  shootday: '#f59e0b',
  editing: 'var(--warning)',
  review: '#fb923c',
  approved: 'var(--success)',
  delivered: '#22c55e',
  archived: 'var(--text-tertiary)',
}

export default async function DashboardPage() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const [activeJobs, reviewJobs, allJobs, totalClients, todayEvents, recentActivity] = await Promise.all([
    db.job.count({ where: { status: { notIn: ['delivered', 'archived'] } } }),
    db.job.count({ where: { status: 'review' } }),
    db.job.findMany({ select: { status: true, quoteValue: true, createdAt: true } }),
    db.client.count(),
    db.event.findMany({
      where: { date: { gte: todayStart, lt: todayEnd } },
      orderBy: { startTime: 'asc' },
      include: { job: { select: { name: true } } },
    }),
    db.activity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { job: { select: { name: true } }, client: { select: { name: true } } },
    }),
  ])

  const revenueThisMonth = allJobs
    .filter((j) => j.status === 'delivered' && j.createdAt >= startOfMonth)
    .reduce((sum, j) => sum + (j.quoteValue || 0), 0)

  // Pipeline counts
  const pipelineCounts: Record<string, number> = {}
  for (const s of JOB_PIPELINE) pipelineCounts[s] = 0
  for (const j of allJobs) {
    if (pipelineCounts[j.status] !== undefined) pipelineCounts[j.status]++
  }
  const totalJobs = allJobs.length || 1

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Briefcase} value={activeJobs} label="Active Jobs" />
        <StatCard icon={Clock} value={reviewJobs} label="Awaiting Review" />
        <StatCard icon={DollarSign} value={formatNZD(revenueThisMonth)} label="Revenue This Month" />
        <StatCard icon={Users} value={totalClients} label="Total Clients" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Agenda */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Today&apos;s Agenda</h2>
          </div>
          {todayEvents.length === 0 ? (
            <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No events scheduled for today.</p>
          ) : (
            <div className="space-y-3">
              {todayEvents.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                  <span className={`badge ${statusBadgeClass(e.eventType)}`}>{statusLabel(e.eventType)}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                  {e.startTime && (
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
                      {e.startTime}{e.endTime ? ` – ${e.endTime}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((a) => (
                <div key={a.id} className="py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {a.details || statusLabel(a.action)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    {a.job?.name || a.client?.name || ''} &middot; {timeAgo(a.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Snapshot */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Job Pipeline</h2>
        <div className="pipeline-bar mb-4">
          {JOB_PIPELINE.map((s) => {
            const pct = (pipelineCounts[s] / totalJobs) * 100
            if (pct === 0) return null
            return (
              <div
                key={s}
                className="pipeline-segment"
                style={{ width: `${pct}%`, background: PIPELINE_COLORS[s] }}
                title={`${statusLabel(s)}: ${pipelineCounts[s]}`}
              />
            )
          })}
        </div>
        <div className="flex flex-wrap gap-4">
          {JOB_PIPELINE.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIPELINE_COLORS[s] }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {statusLabel(s)} <span style={{ color: 'var(--text-tertiary)' }}>({pipelineCounts[s]})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; value: string | number; label: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
