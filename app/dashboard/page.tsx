import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchXeroTransactionsCached } from '@/lib/xero'

export const dynamic = 'force-dynamic'
import { formatNZD, formatDate, getInitials, statusLabel, statusBadgeClass } from '@/lib/format'
import { Plus, UserPlus, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import RevenueSection from './RevenueSection'
import Greeting from './Greeting'

const PIPELINE_STAGES = [
  { key: 'enquiry',    label: 'Enquiry',       statuses: ['enquiry'] },
  { key: 'booked',     label: 'Booked',        statuses: ['booked'] },
  { key: 'production', label: 'In Production', statuses: ['preproduction', 'shootday', 'editing'] },
  { key: 'review',     label: 'Client Review', statuses: ['review'] },
  { key: 'approved',   label: 'Approved',      statuses: ['approved'] },
  { key: 'delivered',  label: 'Delivered',     statuses: ['delivered'] },
] as const


export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()

  const [
    { count: activeJobs },
    { count: reviewJobs },
    { data: deliveredThisMonth },
    { data: deliveredPrevMonth },
    { data: pipelineJobs },
    { data: todayShoots },
    { data: upcomingEvents },
    { data: recentActivity },
    { data: revenueHistory },
    { data: retainerClients },
    { data: recentJobs },
  ] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","archived")'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
    // Bucket revenue by delivered_at (stable), not updated_at — editing an old
    // delivered job must not move its revenue into the current month.
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('delivered_at', startOfMonth),
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('delivered_at', startOfPrevMonth).lt('delivered_at', startOfMonth),
    supabase.from('jobs').select('status, quote_value'),
    supabase.from('events').select('id, title, start_time, end_time, job_id, jobs(id, name)').eq('event_type', 'shoot').gte('date', todayStart).lt('date', todayEnd).order('start_time', { ascending: true }),
    supabase.from('events').select('id, title, event_type, date, start_time, job_id, jobs(id, name)').gte('date', todayStart).order('date', { ascending: true }).limit(5),
    supabase.from('activities').select('id, action, details, created_at, job_id, jobs(id, name), client_id, clients(id, name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('jobs').select('quote_value, delivered_at').in('status', ['delivered', 'archived']).gte('delivered_at', twelveMonthsAgo),
    supabase.from('clients').select('id, name, monthly_retainer, shoots_per_month').eq('client_category', 'retainer'),
    supabase.from('jobs').select('id, name, job_type, status, shoot_date, quote_value, clients(id, name)').neq('status', 'archived').order('updated_at', { ascending: false }).limit(6),
  ])

  const crmRevenueThisMonth = (deliveredThisMonth ?? []).reduce((sum, j) => sum + (j.quote_value || 0), 0)
  const crmRevenuePrevMonth = (deliveredPrevMonth ?? []).reduce((sum, j) => sum + (j.quote_value || 0), 0)

  // Try to pull live Xero revenue from transactions (same source as Finance page).
  // Only requires transactions — summary is not needed here.
  let xeroRevenue: { thisMonth: number; lastMonth: number } | null = null
  let xeroChartMonths: { label: string; value: number }[] | null = null
  try {
    const xt = await fetchXeroTransactionsCached()
    if (xt != null) {
      const paidIn = xt.filter((t) => t.type === 'in' && t.status === 'PAID')
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
      const thisMonthRev = paidIn.filter((t) => t.date >= monthStart).reduce((s, t) => s + t.amount, 0)
      const lastMonthRev = paidIn.filter((t) => t.date >= prevMonthStart && t.date < monthStart).reduce((s, t) => s + t.amount, 0)
      xeroRevenue = { thisMonth: Math.round(thisMonthRev), lastMonth: Math.round(lastMonthRev) }
      xeroChartMonths = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return {
          label: d.toLocaleString('en-NZ', { month: 'short' }),
          value: Math.round(paidIn.filter((t) => t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0)),
        }
      })
    }
  } catch (err) { console.error('[Dashboard] Xero fetch error:', err) }

  const months: { label: string; value: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ label: d.toLocaleString('en-NZ', { month: 'short' }), value: 0 })
  }
  for (const j of revenueHistory ?? []) {
    if (!j.delivered_at) continue
    const d = new Date(j.delivered_at)
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    const slot = 11 - idx
    if (slot >= 0 && slot < 12) months[slot].value += j.quote_value || 0
  }

  const revenueThisMonth = xeroRevenue ? xeroRevenue.thisMonth : crmRevenueThisMonth
  const revenuePrevMonth = xeroRevenue ? xeroRevenue.lastMonth : crmRevenuePrevMonth
  const revenueSource = xeroRevenue ? 'Live from Xero' : 'Based on delivered jobs in CRM'
  // For the CRM fallback chart, patch in the already-computed hero values so current/prev month always show
  const crmChartMonths = months.map((m, i) => {
    if (i === 11) return { ...m, value: crmRevenueThisMonth }
    if (i === 10) return { ...m, value: crmRevenuePrevMonth }
    return m
  })
  const chartData = xeroChartMonths ?? crmChartMonths
  // No prior month to compare against → no delta (a fabricated "100%" reads
  // as fake precision).
  const revenueChangePct = revenuePrevMonth > 0
    ? ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100
    : undefined
  const mrr = (retainerClients ?? []).reduce((sum, c) => sum + ((c as { monthly_retainer?: number }).monthly_retainer || 0), 0)
  const pipelineValue = (pipelineJobs ?? [])
    .filter((j) => !['delivered', 'archived'].includes(j.status))
    .reduce((sum, j) => sum + ((j as { status: string; quote_value?: number }).quote_value || 0), 0)

  const stageCounts: Record<string, number> = {}
  const stageValues: Record<string, number> = {}
  for (const stage of PIPELINE_STAGES) { stageCounts[stage.key] = 0; stageValues[stage.key] = 0 }
  for (const j of pipelineJobs ?? []) {
    const stage = PIPELINE_STAGES.find((s) => (s.statuses as readonly string[]).includes(j.status))
    if (stage) {
      stageCounts[stage.key]++
      stageValues[stage.key] += (j as { quote_value?: number }).quote_value || 0
    }
  }
  const inFlightJobs = PIPELINE_STAGES.reduce((sum, s) => sum + stageCounts[s.key], 0)

  // Monochrome ramp (dark → light) — keeps the breakdown restrained, no rainbow accents
  const STAGE_COLORS = ['#1a1a1f', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#cbcbd1']
  const reportBreakdown = PIPELINE_STAGES
    .map((s, i) => ({ label: s.label, value: stageValues[s.key], color: STAGE_COLORS[i % STAGE_COLORS.length] }))
    .filter((b) => b.value > 0)

  // ── Upcoming retainer shoots ──────────────────────────────────
  // Retainer clients shoot on a monthly cadence derived from
  // shoots_per_month; SHOOT_WEEKS maps that to which weeks of the
  // month get a shoot (matches the client-record schedule view).
  const SHOOT_WEEKS: Record<number, number[]> = { 1: [2], 2: [1, 3], 3: [1, 2, 4], 4: [1, 2, 3, 4] }
  const cadenceLabel = (spm: number) =>
    spm >= 4 ? 'Weekly' : spm === 3 ? '3× / month' : spm === 2 ? 'Fortnightly' : 'Monthly'
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const retainerRows = (retainerClients ?? []) as unknown as { id: string; name: string; shoots_per_month: number | null }[]
  const upcomingShoots = retainerRows
    .flatMap((c) => {
      const spm = Math.min(Math.max(c.shoots_per_month ?? 1, 1), 4)
      const weeks = SHOOT_WEEKS[spm] ?? [2]
      const out: { clientId: string; clientName: string; cadence: string; shootsPerMonth: number; dateISO: string; weekLabel: string }[] = []
      for (let mo = 0; mo <= 2; mo++) {
        const base = new Date(now.getFullYear(), now.getMonth() + mo, 1)
        for (const w of weeks) {
          const dt = new Date(base.getFullYear(), base.getMonth(), (w - 1) * 7 + 1)
          if (dt >= todayMidnight) {
            out.push({ clientId: c.id, clientName: c.name, cadence: cadenceLabel(spm), shootsPerMonth: spm, dateISO: dt.toISOString(), weekLabel: `Week ${w}` })
          }
        }
      }
      return out
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .slice(0, 7)

  const reportData = {
    revenueThisMonth,
    revenuePrevMonth,
    changePct: revenueChangePct,
    chartData,
    breakdown: reportBreakdown,
    source: revenueSource,
    upcomingShoots,
  }

  const todayLabel = now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })

  const jobsList = (recentJobs ?? []) as unknown as {
    id: string; name: string; job_type: string | null; status: string
    shoot_date: string | null; quote_value: number | null
    clients: { id: string; name: string } | null
  }[]

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1 }}>
          <Greeting />
        </h1>
        <div className="page-header-actions">
          <Link href="/dashboard/clients/new" className="btn-secondary">
            <UserPlus className="w-4 h-4" /> New Client
          </Link>
          <Link href="/dashboard/jobs/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Job
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Revenue this month" value={formatNZD(revenueThisMonth)} delta={revenueChangePct} />
        <KpiCard label="Monthly retainers" value={formatNZD(mrr)} sub={`${(retainerClients ?? []).length} client${(retainerClients ?? []).length === 1 ? '' : 's'}`} />
        <KpiCard label="Pipeline value" value={formatNZD(pipelineValue)} sub={`${inFlightJobs} in flight`} />
        <KpiCard label="Active jobs" value={String(activeJobs ?? 0)} sub={`${reviewJobs ?? 0} awaiting review`} />
      </div>

      {/* Revenue section — no card container */}
      <RevenueSection
        allMonthsData={chartData}
        revenueThisMonth={revenueThisMonth}
        revenuePrevMonth={revenuePrevMonth}
        changePct={revenueChangePct}
        reportData={reportData}
      />

      {/* Recent jobs (transactions-style table) */}
      <div>
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Recent jobs</h2>
          <Link href="/dashboard/jobs" className="btn-ghost btn-ghost-accent">
            View all <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {jobsList.length === 0 ? (
          <p className="text-sm px-6 py-6" style={{ color: 'var(--text-tertiary)' }}>No jobs yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header text-left" style={{ paddingLeft: 0 }}>Client</th>
                <th className="table-header text-left hidden sm:table-cell">Job</th>
                <th className="table-header text-left hidden md:table-cell">Status</th>
                <th className="table-header text-left hidden lg:table-cell">Date</th>
                <th className="table-header text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {jobsList.map((j) => (
                <tr key={j.id} className="table-row">
                  <td className="pr-6 py-3.5">
                    <Link href={`/dashboard/jobs/${j.id}`} className="flex items-center gap-3">
                      <div className="avatar avatar-sm">{getInitials(j.clients?.name || j.name)}</div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{j.clients?.name || '—'}</span>
                    </Link>
                  </td>
                  <td className="px-6 py-3.5 hidden sm:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{j.name}</td>
                  <td className="px-6 py-3.5 hidden md:table-cell">
                    <span className={`badge badge-sm ${statusBadgeClass(j.status)}`}>{statusLabel(j.status)}</span>
                  </td>
                  <td className="px-6 py-3.5 hidden lg:table-cell text-sm" style={{ color: 'var(--text-tertiary)' }}>{formatDate(j.shoot_date)}</td>
                  <td className="px-6 py-3.5 text-right text-sm font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>{j.quote_value ? formatNZD(j.quote_value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, delta, sub }: { label: string; value: string; delta?: number; sub?: string }) {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <div className="kpi-value-row">
        <span className="kpi-value">{value}</span>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  )
}

function Delta({ pct }: { pct: number }) {
  const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10
  if (!pct) return <span className="delta delta-flat">0%</span>
  const cls = pct > 0 ? 'delta-up' : 'delta-down'
  const arrow = pct > 0 ? '↑' : '↓'
  return <span className={`delta ${cls}`}>{arrow} {Math.abs(rounded)}%</span>
}
