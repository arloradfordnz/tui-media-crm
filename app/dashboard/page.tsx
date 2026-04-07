import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import { Briefcase, Clock, DollarSign, Users, CalendarDays, Activity, Plus, UserPlus, Camera, CheckSquare } from 'lucide-react'
import TodoWidget from './TodoWidget'
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
  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [
    { count: activeJobs },
    { count: reviewJobs },
    { count: leadsInPipeline },
    { data: allJobs },
    { data: todayShoots },
    { data: upcomingEvents },
    { data: recentActivity },
  ] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","archived")'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).in('pipeline_stage', ['enquiry', 'discovery']),
    supabase.from('jobs').select('status, quote_value, created_at'),
    supabase.from('events').select('id, title, start_time, end_time, job_id, jobs(id, name)').eq('event_type', 'shoot').gte('date', todayStart).lt('date', todayEnd).order('start_time', { ascending: true }),
    supabase.from('events').select('id, title, event_type, date, start_time, job_id, jobs(id, name)').gte('date', todayStart).order('date', { ascending: true }).limit(5),
    supabase.from('activities').select('id, action, details, created_at, job_id, jobs(id, name), client_id, clients(id, name)').order('created_at', { ascending: false }).limit(10),
  ])

  const revenueThisMonth = (allJobs ?? [])
    .filter((j) => j.status === 'delivered' && j.created_at >= startOfMonth)
    .reduce((sum, j) => sum + (j.quote_value || 0), 0)

  const pipelineCounts: Record<string, number> = {}
  for (const s of JOB_PIPELINE) pipelineCounts[s] = 0
  for (const j of allJobs ?? []) {
    if (pipelineCounts[j.status] !== undefined) pipelineCounts[j.status]++
  }
  const totalJobs = (allJobs ?? []).length || 1

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Briefcase} value={activeJobs ?? 0} label="Active Jobs" />
        <StatCard icon={Clock} value={reviewJobs ?? 0} label="Awaiting Review" />
        <StatCard icon={DollarSign} value={formatNZD(revenueThisMonth)} label="Revenue This Month" />
        <StatCard icon={Users} value={leadsInPipeline ?? 0} label="Leads in Pipeline" />
        <div className="stat-card flex flex-col items-center justify-center text-center">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-2">
            <path d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4z" fill="#13B5EA"/>
            <path d="M28.5 17.5c-2.5-1.5-5.5-1-7 1s-1 5.5 1.5 7c2 1.2 3.5 2.5 3.5 4.5 0 1.5-1 2.5-2.5 2.5s-2.5-1-2.5-2.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M24 14v-2m0 24v-2" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Financial dashboard coming soon</p>
          <button className="btn-secondary text-xs" style={{ padding: '6px 12px', opacity: 0.7, cursor: 'not-allowed' }} disabled>
            Connect Xero
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
                    <div key={e.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                      <div className="flex-1">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                        {job && (
                          <Link href={`/dashboard/jobs/${job.id}`} className="text-xs ml-2" style={{ color: 'var(--accent)' }}>{job.name}</Link>
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

          {/* Upcoming Schedule */}
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
                  <div key={e.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
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
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h2>
          </div>
          {(recentActivity ?? []).length === 0 ? (
            <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {(recentActivity ?? []).map((a) => {
                const job = a.jobs as unknown as { id: string; name: string } | null
                const client = a.clients as unknown as { id: string; name: string } | null
                return (
                  <div key={a.id} className="py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {a.details || statusLabel(a.action)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {job ? (
                        <Link href={`/dashboard/jobs/${job.id}`} style={{ color: 'var(--accent)' }}>{job.name}</Link>
                      ) : client ? (
                        <Link href={`/dashboard/clients/${client.id}`} style={{ color: 'var(--accent)' }}>{client.name}</Link>
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
