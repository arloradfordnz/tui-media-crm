import { db } from '@/lib/db'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import { Briefcase, Clock, DollarSign, Users, CalendarDays, Activity, Plus, UserPlus, Camera } from 'lucide-react'
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

  const [activeJobs, reviewJobs, leadsInPipeline, allJobs, todayShoots, upcomingEvents, recentActivity] = await Promise.all([
    db.job.count({ where: { status: { notIn: ['delivered', 'archived'] } } }),
    db.job.count({ where: { status: 'review' } }),
    db.client.count({ where: { pipelineStage: { in: ['enquiry', 'discovery'] } } }),
    db.job.findMany({ select: { status: true, quoteValue: true, createdAt: true } }),
    db.event.findMany({
      where: { date: { gte: todayStart, lt: todayEnd }, eventType: 'shoot' },
      orderBy: { startTime: 'asc' },
      include: { job: { select: { id: true, name: true } } },
    }),
    db.event.findMany({
      where: { date: { gte: todayStart } },
      orderBy: { date: 'asc' },
      take: 5,
      include: { job: { select: { id: true, name: true } } },
    }),
    db.activity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { job: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } },
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/clients/new" className="btn-secondary text-sm">
            <UserPlus className="w-3.5 h-3.5" /> New Client
          </Link>
          <Link href="/dashboard/jobs/new" className="btn-primary text-sm">
            <Plus className="w-3.5 h-3.5" /> New Job
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Briefcase} value={activeJobs} label="Active Jobs" />
        <StatCard icon={Clock} value={reviewJobs} label="Awaiting Review" />
        <StatCard icon={DollarSign} value={formatNZD(revenueThisMonth)} label="Revenue This Month" />
        <StatCard icon={Users} value={leadsInPipeline} label="Leads in Pipeline" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Today's Shoots + Upcoming */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Shoots */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Today&apos;s Shoots</h2>
            </div>
            {todayShoots.length === 0 ? (
              <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No shoots scheduled for today.</p>
            ) : (
              <div className="space-y-3">
                {todayShoots.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                    <div className="flex-1">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                      {e.job && (
                        <Link href={`/dashboard/jobs/${e.job.id}`} className="text-xs ml-2" style={{ color: 'var(--accent)' }}>{e.job.name}</Link>
                      )}
                    </div>
                    {e.startTime && (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {e.startTime}{e.endTime ? ` – ${e.endTime}` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Schedule */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Upcoming</h2>
              </div>
              <Link href="/dashboard/calendar" className="text-xs" style={{ color: 'var(--accent)' }}>View Calendar &rarr;</Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No upcoming events.</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                    <span className={`badge ${statusBadgeClass(e.eventType)}`}>{statusLabel(e.eventType)}</span>
                    <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(e.date)}</span>
                    {e.startTime && (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.startTime}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
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
                    {a.job ? (
                      <Link href={`/dashboard/jobs/${a.job.id}`} style={{ color: 'var(--accent)' }}>{a.job.name}</Link>
                    ) : a.client ? (
                      <Link href={`/dashboard/clients/${a.client.id}`} style={{ color: 'var(--accent)' }}>{a.client.name}</Link>
                    ) : null}
                    {(a.job || a.client) && ' · '}
                    {timeAgo(a.createdAt)}
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
