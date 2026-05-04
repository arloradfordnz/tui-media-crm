import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import { Briefcase, Clock, DollarSign, Users, CalendarDays, Activity, Plus, UserPlus, Camera, TrendingUp, ArrowRight, Sparkles, ArrowUpRight } from 'lucide-react'
import TodoWidget from './TodoWidget'
import BusinessHealth from './BusinessHealth'
import Link from 'next/link'
import RevenueChart from './RevenueChart'

const PIPELINE_STAGES = [
  { key: 'enquiry',    label: 'Enquiry',       statuses: ['enquiry'] },
  { key: 'booked',     label: 'Booked',        statuses: ['booked'] },
  { key: 'production', label: 'In Production', statuses: ['preproduction', 'shootday', 'editing'] },
  { key: 'review',     label: 'Client Review', statuses: ['review'] },
  { key: 'approved',   label: 'Approved',      statuses: ['approved'] },
  { key: 'delivered',  label: 'Delivered',     statuses: ['delivered'] },
] as const

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  const [
    { count: activeJobs },
    { count: reviewJobs },
    { count: leadsInPipeline },
    { data: deliveredThisMonth },
    { data: pipelineJobs },
    { data: todayShoots },
    { data: upcomingEvents },
    { data: recentActivity },
    { data: revenueHistory },
  ] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","archived")'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'lead'),
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('created_at', startOfMonth),
    supabase.from('jobs').select('status, quote_value'),
    supabase.from('events').select('id, title, start_time, end_time, job_id, jobs(id, name)').eq('event_type', 'shoot').gte('date', todayStart).lt('date', todayEnd).order('start_time', { ascending: true }),
    supabase.from('events').select('id, title, event_type, date, start_time, job_id, jobs(id, name)').gte('date', todayStart).order('date', { ascending: true }).limit(5),
    supabase.from('activities').select('id, action, details, created_at, job_id, jobs(id, name), client_id, clients(id, name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('jobs').select('quote_value, created_at').eq('status', 'delivered').gte('created_at', sixMonthsAgo),
  ])

  const revenueThisMonth = (deliveredThisMonth ?? []).reduce((sum, j) => sum + (j.quote_value || 0), 0)
  const pipelineValue = (pipelineJobs ?? [])
    .filter((j) => !['delivered', 'archived'].includes(j.status))
    .reduce((sum, j) => sum + ((j as { status: string; quote_value?: number }).quote_value || 0), 0)

  const stageCounts: Record<string, number> = {}
  for (const stage of PIPELINE_STAGES) stageCounts[stage.key] = 0
  for (const j of pipelineJobs ?? []) {
    const stage = PIPELINE_STAGES.find((s) => (s.statuses as readonly string[]).includes(j.status))
    if (stage) stageCounts[stage.key]++
  }
  const inFlightJobs = PIPELINE_STAGES.reduce((sum, s) => sum + stageCounts[s.key], 0)

  const months: { label: string; value: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ label: d.toLocaleString('en-NZ', { month: 'short' }), value: 0 })
  }
  for (const j of revenueHistory ?? []) {
    const d = new Date(j.created_at)
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    const slot = 5 - idx
    if (slot >= 0 && slot < 6) months[slot].value += j.quote_value || 0
  }

  const todayLabel = now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <div className="card-hero flex flex-col md:flex-row md:items-end md:justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-sm opacity-90 mb-2">
            <Sparkles className="w-4 h-4" />
            <span>{todayLabel}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold" style={{ letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            {greeting(now)}, Arlo.
          </h1>
          <p className="text-sm md:text-base opacity-90 mt-2 max-w-md">
            {inFlightJobs > 0
              ? `You've got ${inFlightJobs} job${inFlightJobs === 1 ? '' : 's'} in flight and ${reviewJobs ?? 0} awaiting your review.`
              : `Quiet day — perfect time to chase leads or plan the next shoot.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/clients/new" className="btn-hero-light">
            <UserPlus className="w-4 h-4" /> New Client
          </Link>
          <Link href="/dashboard/jobs/new" className="btn-hero-solid">
            <Plus className="w-4 h-4" /> New Job
          </Link>
        </div>
      </div>

      {/* Stat cards — all uniform with icon bubbles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} value={formatNZD(revenueThisMonth)} label="Revenue this month" />
        <StatCard icon={TrendingUp} value={formatNZD(pipelineValue)} label="Pipeline value" />
        <StatCard icon={Briefcase} value={activeJobs ?? 0} label="Active jobs" />
        <StatCard icon={Clock} value={reviewJobs ?? 0} label="Awaiting review" />
      </div>

      {/* Revenue chart + side stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <SectionHeader icon={TrendingUp} title="Revenue trend" subtitle="Delivered jobs · last 6 months">
            <span className="badge badge-accent">{formatNZD(months.reduce((s, m) => s + m.value, 0))}</span>
          </SectionHeader>
          <div className="box-inset-lg" style={{ padding: '0.5rem' }}>
            <RevenueChart data={months} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 grid-rows-[auto_1fr]">
          <StatCard icon={Users} value={leadsInPipeline ?? 0} label="Leads in pipeline" />
          <div className="card flex flex-col">
            <SectionHeader icon={Camera} title="Shoots today" subtitle={`${(todayShoots ?? []).length} scheduled`} />
            {(todayShoots ?? []).length === 0 ? (
              <div className="box-inset text-xs flex-1 flex items-center justify-center text-center" style={{ color: 'var(--text-tertiary)' }}>
                Nothing on the schedule today.
              </div>
            ) : (
              <div className="space-y-2 flex-1">
                {(todayShoots ?? []).slice(0, 3).map((e) => (
                  <div key={e.id} className="box-inset flex items-center justify-between gap-2">
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                    {e.start_time && <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{e.start_time}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* To Do List */}
      <TodoWidget />

      {/* Upcoming + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <SectionHeader icon={CalendarDays} title="Upcoming">
            <Link href="/dashboard/calendar" className="btn-ghost btn-ghost-accent">
              View calendar <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </SectionHeader>
          {(upcomingEvents ?? []).length === 0 ? (
            <div className="box-inset text-sm" style={{ color: 'var(--text-tertiary)' }}>No upcoming events.</div>
          ) : (
            <div className="space-y-2">
              {(upcomingEvents ?? []).map((e) => (
                <div key={e.id} className="box-inset flex items-center gap-3">
                  <span className={`badge ${statusBadgeClass(e.event_type)}`}>{statusLabel(e.event_type)}</span>
                  <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{formatDate(e.date)}</span>
                  {e.start_time && <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{e.start_time}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <SectionHeader icon={Activity} title="Recent activity">
            <Link href="/dashboard/activity" className="btn-ghost btn-ghost-accent">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </SectionHeader>
          {(recentActivity ?? []).length === 0 ? (
            <div className="box-inset text-sm" style={{ color: 'var(--text-tertiary)' }}>No activity yet.</div>
          ) : (
            <div className="space-y-2">
              {(recentActivity ?? []).map((a) => {
                const job = a.jobs as unknown as { id: string; name: string } | null
                const client = a.clients as unknown as { id: string; name: string } | null
                return (
                  <div key={a.id} className="box-inset">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{a.details || statusLabel(a.action)}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {job ? <Link href={`/dashboard/jobs/${job.id}`} className="link-subtle">{job.name}</Link>
                        : client ? <Link href={`/dashboard/clients/${client.id}`} className="link-subtle">{client.name}</Link>
                        : null}
                      {(job || client) && ' · '}{timeAgo(a.created_at)}
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

      {/* Pipeline Snapshot */}
      <div className="card">
        <SectionHeader icon={Briefcase} title="Job pipeline" subtitle={`${inFlightJobs} job${inFlightJobs === 1 ? '' : 's'} in flight`}>
          <Link href="/dashboard/jobs" className="btn-ghost btn-ghost-accent">
            View all jobs <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PIPELINE_STAGES.map((stage, i) => {
            const count = stageCounts[stage.key]
            const isLast = i === PIPELINE_STAGES.length - 1
            return (
              <Link
                key={stage.key}
                href={`/dashboard/jobs?status=${stage.statuses[0]}`}
                className="relative box-inset-lg transition-all hover:-translate-y-0.5"
                style={{ borderTop: '3px solid var(--accent)' }}
              >
                <div className="text-[10px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                  {stage.label}
                </div>
                <div className="text-3xl font-semibold tabular-nums" style={{ color: count > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', letterSpacing: '-0.02em' }}>
                  {count}
                </div>
                {!isLast && (
                  <ArrowRight className="hidden lg:block absolute top-1/2 -right-3 w-3.5 h-3.5 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle, children }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="stat-icon-bubble bubble-sm">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          {subtitle && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function StatCard({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: string | number; label: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div className="stat-icon-bubble">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="stat-value truncate">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
