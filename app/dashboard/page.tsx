import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import { Briefcase, Clock, DollarSign, Users, CalendarDays, Activity, Plus, UserPlus, Camera, TrendingUp, ArrowRight } from 'lucide-react'
import TodoWidget from './TodoWidget'
import BusinessHealth from './BusinessHealth'
import Link from 'next/link'

// Pipeline shown on the dashboard collapses 9 internal statuses into the 6
// stages that map to actual workflow steps. `archived` is omitted — those jobs
// are no longer "in flight". The status->stage map drives the per-stage counts.
const PIPELINE_STAGES = [
  { key: 'enquiry',    label: 'Enquiry',     statuses: ['enquiry'],                              color: 'var(--accent)' },
  { key: 'booked',     label: 'Booked',      statuses: ['booked'],                               color: 'var(--accent-hover)' },
  { key: 'production', label: 'In Production', statuses: ['preproduction', 'shootday', 'editing'], color: 'var(--warning)' },
  { key: 'review',     label: 'Client Review', statuses: ['review'],                             color: '#fb923c' },
  { key: 'approved',   label: 'Approved',    statuses: ['approved'],                             color: 'var(--success)' },
  { key: 'delivered',  label: 'Delivered',   statuses: ['delivered'],                            color: '#22c55e' },
] as const

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [
    { count: activeJobs },
    { count: reviewJobs },
    { count: leadsInPipeline },
    { data: deliveredThisMonth },
    { data: pipelineJobs },
    { data: todayShoots },
    { data: upcomingEvents },
    { data: recentActivity },
  ] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","archived")'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).in('pipeline_stage', ['enquiry', 'discovery']),
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('created_at', startOfMonth),
    supabase.from('jobs').select('status, quote_value'),
    supabase.from('events').select('id, title, start_time, end_time, job_id, jobs(id, name)').eq('event_type', 'shoot').gte('date', todayStart).lt('date', todayEnd).order('start_time', { ascending: true }),
    supabase.from('events').select('id, title, event_type, date, start_time, job_id, jobs(id, name)').gte('date', todayStart).order('date', { ascending: true }).limit(5),
    supabase.from('activities').select('id, action, details, created_at, job_id, jobs(id, name), client_id, clients(id, name)').order('created_at', { ascending: false }).limit(5),
  ])

  const revenueThisMonth = (deliveredThisMonth ?? []).reduce((sum, j) => sum + (j.quote_value || 0), 0)
  const pipelineValue = (pipelineJobs ?? [])
    .filter((j) => !['delivered', 'archived'].includes(j.status))
    .reduce((sum, j) => sum + ((j as { status: string; quote_value?: number }).quote_value || 0), 0)

  // Count jobs per dashboard stage (collapsing the 9 raw statuses into 6).
  const stageCounts: Record<string, number> = {}
  for (const stage of PIPELINE_STAGES) stageCounts[stage.key] = 0
  for (const j of pipelineJobs ?? []) {
    const stage = PIPELINE_STAGES.find((s) => (s.statuses as readonly string[]).includes(j.status))
    if (stage) stageCounts[stage.key]++
  }
  const inFlightJobs = PIPELINE_STAGES.reduce((sum, s) => sum + stageCounts[s.key], 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Briefcase} value={activeJobs ?? 0} label="Active Jobs" />
        <StatCard icon={Clock} value={reviewJobs ?? 0} label="Awaiting Review" />
        <StatCard icon={DollarSign} value={formatNZD(revenueThisMonth)} label="Revenue This Month" />
        <StatCard icon={Users} value={leadsInPipeline ?? 0} label="Leads in Pipeline" />
        <StatCard icon={TrendingUp} value={formatNZD(pipelineValue)} label="Pipeline Value" />
      </div>

      {/* To Do List */}
      <TodoWidget />

      {/* Today's Shoots */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Today&apos;s Shoots</h2>
        </div>
        {(todayShoots ?? []).length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No shoots scheduled for today.</p>
        ) : (
          <div className="space-y-3">
            {(todayShoots ?? []).map((e) => {
              const job = e.jobs as unknown as { id: string; name: string } | null
              return (
                <div key={e.id} className="flex items-center gap-3 py-2" style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '8px 12px', marginBottom: '4px' }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                  <div className="flex-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                    {job && (
                      <Link href={`/dashboard/jobs/${job.id}`} className="text-xs ml-2 link-subtle">{job.name}</Link>
                    )}
                  </div>
                  {e.start_time && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {e.start_time}{e.end_time ? ` – ${e.end_time}` : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upcoming + Recent Activity — paired so the cards stay equal height */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Upcoming</h2>
            </div>
            <Link href="/dashboard/calendar" className="text-xs" style={{ color: 'var(--accent)' }}>View Calendar &rarr;</Link>
          </div>
          {(upcomingEvents ?? []).length === 0 ? (
            <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No upcoming events.</p>
          ) : (
            <div className="space-y-3">
              {(upcomingEvents ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2" style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '8px 12px', marginBottom: '4px' }}>
                  <span className={`badge ${statusBadgeClass(e.event_type)}`}>{statusLabel(e.event_type)}</span>
                  <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(e.date)}</span>
                  {e.start_time && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.start_time}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h2>
            </div>
            <Link href="/dashboard/activity" className="text-xs" style={{ color: 'var(--accent)' }}>View All &rarr;</Link>
          </div>
          {(recentActivity ?? []).length === 0 ? (
            <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {(recentActivity ?? []).map((a) => {
                const job = a.jobs as unknown as { id: string; name: string } | null
                const client = a.clients as unknown as { id: string; name: string } | null
                return (
                  <div key={a.id} className="py-2" style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '8px 12px', marginBottom: '4px' }}>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {a.details || statusLabel(a.action)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {job ? (
                        <Link href={`/dashboard/jobs/${job.id}`} className="link-subtle">{job.name}</Link>
                      ) : client ? (
                        <Link href={`/dashboard/clients/${client.id}`} className="link-subtle">{client.name}</Link>
                      ) : null}
                      {(job || client) && ' · '}
                      {timeAgo(a.created_at)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Business Health */}
      <BusinessHealth />

      {/* Pipeline Snapshot — six stages, left-to-right, count per stage */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Job Pipeline</h2>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {inFlightJobs} job{inFlightJobs === 1 ? '' : 's'} in flight
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const count = stageCounts[stage.key]
            const isLast = i === PIPELINE_STAGES.length - 1
            return (
              <Link
                key={stage.key}
                href={`/dashboard/jobs?status=${stage.statuses[0]}`}
                className="relative rounded-lg px-3 py-3 transition-colors hover:opacity-90"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--bg-border)',
                  borderTop: `3px solid ${stage.color}`,
                }}
              >
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  {stage.label}
                </div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: count > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {count}
                </div>
                {!isLast && (
                  <ArrowRight className="hidden lg:block absolute top-1/2 -right-2.5 w-3 h-3 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                )}
              </Link>
            )
          })}
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
