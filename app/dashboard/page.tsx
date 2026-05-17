import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchXeroTransactions } from '@/lib/xero'

export const dynamic = 'force-dynamic'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import { Plus, UserPlus, ArrowRight, ArrowUpRight, Briefcase, Clock, Users, TrendingUp, RefreshCw } from 'lucide-react'
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
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  const [
    { count: activeJobs },
    { count: reviewJobs },
    { count: leadsInPipeline },
    { data: deliveredThisMonth },
    { data: deliveredPrevMonth },
    { data: pipelineJobs },
    { data: todayShoots },
    { data: upcomingEvents },
    { data: recentActivity },
    { data: revenueHistory },
    { data: retainerClients },
  ] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","archived")'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'lead'),
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('updated_at', startOfMonth),
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('updated_at', startOfPrevMonth).lt('updated_at', startOfMonth),
    supabase.from('jobs').select('status, quote_value'),
    supabase.from('events').select('id, title, start_time, end_time, job_id, jobs(id, name)').eq('event_type', 'shoot').gte('date', todayStart).lt('date', todayEnd).order('start_time', { ascending: true }),
    supabase.from('events').select('id, title, event_type, date, start_time, job_id, jobs(id, name)').gte('date', todayStart).order('date', { ascending: true }).limit(5),
    supabase.from('activities').select('id, action, details, created_at, job_id, jobs(id, name), client_id, clients(id, name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('jobs').select('quote_value, updated_at').in('status', ['delivered', 'archived']).gte('updated_at', sixMonthsAgo),
    supabase.from('clients').select('id, name, monthly_retainer').eq('status', 'retainer'),
  ])

  const crmRevenueThisMonth = (deliveredThisMonth ?? []).reduce((sum, j) => sum + (j.quote_value || 0), 0)
  const crmRevenuePrevMonth = (deliveredPrevMonth ?? []).reduce((sum, j) => sum + (j.quote_value || 0), 0)

  // Try to pull live Xero revenue from transactions (same source as Finance page).
  // Only requires transactions — summary is not needed here.
  let xeroRevenue: { thisMonth: number; lastMonth: number } | null = null
  let xeroChartMonths: { label: string; value: number }[] | null = null
  try {
    const xt = await fetchXeroTransactions()
    if (xt != null) {
      const paidIn = xt.filter((t) => t.type === 'in' && t.status === 'PAID')
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
      const thisMonthRev = paidIn.filter((t) => t.date >= monthStart).reduce((s, t) => s + t.amount, 0)
      const lastMonthRev = paidIn.filter((t) => t.date >= prevMonthStart && t.date < monthStart).reduce((s, t) => s + t.amount, 0)
      xeroRevenue = { thisMonth: Math.round(thisMonthRev), lastMonth: Math.round(lastMonthRev) }
      xeroChartMonths = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return {
          label: d.toLocaleString('en-NZ', { month: 'short' }),
          value: Math.round(paidIn.filter((t) => t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0)),
        }
      })
    }
  } catch (err) { console.error('[Dashboard] Xero fetch error:', err) }

  const months: { label: string; value: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ label: d.toLocaleString('en-NZ', { month: 'short' }), value: 0 })
  }
  for (const j of revenueHistory ?? []) {
    const d = new Date(j.updated_at)
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    const slot = 5 - idx
    if (slot >= 0 && slot < 6) months[slot].value += j.quote_value || 0
  }

  const revenueThisMonth = xeroRevenue ? xeroRevenue.thisMonth : crmRevenueThisMonth
  const revenuePrevMonth = xeroRevenue ? xeroRevenue.lastMonth : crmRevenuePrevMonth
  const revenueSource = xeroRevenue ? 'Live from Xero' : 'Based on delivered jobs in CRM'
  // For the CRM fallback chart, patch in the already-computed hero values so current/prev month always show
  const crmChartMonths = months.map((m, i) => {
    if (i === 5) return { ...m, value: crmRevenueThisMonth }
    if (i === 4) return { ...m, value: crmRevenuePrevMonth }
    return m
  })
  const chartData = xeroChartMonths ?? crmChartMonths
  const revenueChangePct = revenuePrevMonth > 0
    ? ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100
    : revenueThisMonth > 0 ? 100 : 0
  const mrr = (retainerClients ?? []).reduce((sum, c) => sum + ((c as { monthly_retainer?: number }).monthly_retainer || 0), 0)
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

  const todayLabel = now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-tertiary)' }}>{todayLabel}</p>
          <h1 className="text-3xl font-semibold" style={{ letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            {greeting(now)}, Arlo.
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {inFlightJobs > 0
              ? `You've got ${inFlightJobs} job${inFlightJobs === 1 ? '' : 's'} in flight and ${reviewJobs ?? 0} awaiting your review.`
              : `Quiet day — perfect time to chase leads or plan the next shoot.`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/dashboard/clients/new" className="btn-secondary">
            <UserPlus className="w-4 h-4" /> New Client
          </Link>
          <Link href="/dashboard/jobs/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Job
          </Link>
        </div>
      </div>

      {/* Revenue chart hero + side stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="stat-label" style={{ margin: 0 }}>Revenue</p>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-4xl md:text-5xl font-semibold tabular-nums" style={{ letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1 }}>
                  {formatNZD(revenueThisMonth)}
                </span>
                <ChangeBadge pct={revenueChangePct} />
              </div>
              {revenuePrevMonth > 0 && (
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  {revenueThisMonth === 0
                    ? `Last month: ${formatNZD(revenuePrevMonth)}`
                    : `vs ${formatNZD(revenuePrevMonth)} last month`}
                </p>
              )}
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>{revenueSource}</p>
            </div>
          </div>
          <div className="mt-auto">
            <RevenueChart data={chartData} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Monthly Retainers */}
          <div className="card flex flex-col gap-3 relative overflow-hidden">
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--success)', borderRadius: '4px 4px 0 0' }} />
            <div className="flex items-center gap-2 pt-1">
              <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.07em' }}>Monthly Retainers</p>
            </div>
            <p className="text-3xl font-semibold tabular-nums" style={{ letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1 }}>{formatNZD(mrr)}</p>
            <div className="space-y-1.5">
              {(retainerClients ?? []).length === 0
                ? <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No retainer clients</p>
                : (retainerClients ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{c.name}</span>
                    <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-tertiary)' }}>{formatNZD((c as { monthly_retainer?: number }).monthly_retainer ?? 0)}/mo</span>
                  </div>
                ))}
            </div>
          </div>
          {/* Pipeline Value */}
          <div className="card flex flex-col gap-3 relative overflow-hidden">
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--accent)', borderRadius: '4px 4px 0 0' }} />
            <div className="flex items-center gap-2 pt-1">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.07em' }}>Pipeline Value</p>
            </div>
            <p className="text-3xl font-semibold tabular-nums" style={{ letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1 }}>{formatNZD(pipelineValue)}</p>
            <div className="space-y-1.5">
              {PIPELINE_STAGES.filter((s) => stageCounts[s.key] > 0).map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                  <span className="text-xs tabular-nums shrink-0 font-medium" style={{ color: 'var(--text-tertiary)' }}>{stageCounts[s.key]}</span>
                </div>
              ))}
              {inFlightJobs === 0 && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No jobs in flight</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <IconStatCard value={activeJobs ?? 0} label="Active jobs" icon={<Briefcase className="w-4 h-4" />} />
        <IconStatCard value={reviewJobs ?? 0} label="Awaiting review" icon={<Clock className="w-4 h-4" />} accent={reviewJobs ? 'var(--warning)' : undefined} />
        <IconStatCard value={leadsInPipeline ?? 0} label="Leads in pipeline" icon={<Users className="w-4 h-4" />} />
        <div className="card flex flex-col">
          <div className="mb-3">
            <p className="text-xl font-semibold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Shoots today</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{(todayShoots ?? []).length} scheduled</p>
          </div>
          {(todayShoots ?? []).length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Nothing today.</p>
          ) : (
            <div className="space-y-1.5">
              {(todayShoots ?? []).slice(0, 2).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                  {e.start_time && <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{e.start_time}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* To Do List */}
      <TodoWidget />

      {/* Upcoming + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <SectionHeader title="Upcoming">
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
          <SectionHeader title="Recent activity">
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
        <SectionHeader title="Job pipeline" subtitle={`${inFlightJobs} job${inFlightJobs === 1 ? '' : 's'} in flight`}>
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
                className="relative box-inset-lg"
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

function SectionHeader({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold truncate" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value truncate">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function IconStatCard({ value, label, icon, accent }: { value: string | number; label: string; icon?: React.ReactNode; accent?: string }) {
  return (
    <div className="card flex flex-col gap-2">
      {icon && (
        <div style={{ color: accent ?? 'var(--accent)', opacity: 0.8 }}>{icon}</div>
      )}
      <div className="text-3xl font-semibold tabular-nums" style={{ letterSpacing: '-0.03em', color: accent ?? 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  )
}

function ChangeBadge({ pct }: { pct: number }) {
  const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10
  if (pct === 0) {
    return <span className="stat-change stat-change-flat">0%</span>
  }
  const cls = pct > 0 ? 'stat-change-up' : 'stat-change-down'
  const arrow = pct > 0 ? '↑' : '↓'
  return <span className={`stat-change ${cls}`}>{arrow} {Math.abs(rounded)}%</span>
}
