import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD } from '@/lib/format'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import RevenueSection from '../RevenueSection'
import RevenueLive from '../RevenueLive'
import { type UpcomingShoot } from '../MonthlyReport'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Insights' }

// Everything the old home screen led with: KPIs and the twelve-month revenue
// chart. Genuinely useful once a month, useless daily — so it costs a click
// from Today rather than occupying the fold.

const PIPELINE_STAGES = [
  { key: 'enquiry',    label: 'Enquiry',       statuses: ['enquiry'] },
  { key: 'booked',     label: 'Booked',        statuses: ['booked'] },
  { key: 'production', label: 'In Production', statuses: ['preproduction', 'shootday', 'editing'] },
  { key: 'review',     label: 'Client Review', statuses: ['review'] },
  { key: 'approved',   label: 'Approved',      statuses: ['approved'] },
  { key: 'delivered',  label: 'Delivered',     statuses: ['delivered'] },
] as const

// A single-hue ramp off the brand blue — restrained, no rainbow accents.
const STAGE_COLORS = ['#2F5FD0', '#4A7AE4', '#6E9BF7', '#93B5F9', '#B4CCFB', '#D3E0FD']

export default async function InsightsPage() {
  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()
  const todayISO = now.toISOString().slice(0, 10)

  const [
    { count: activeJobs },
    { count: reviewJobs },
    { data: deliveredThisMonth },
    { data: deliveredPrevMonth },
    { data: pipelineJobs },
    { data: revenueHistory },
    { data: retainerClients },
    { data: bookedShoots },
  ] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","archived")'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
    // Bucket by delivered_at (stable), not updated_at — editing an old
    // delivered job must not move its revenue into the current month.
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('delivered_at', startOfMonth),
    supabase.from('jobs').select('quote_value').eq('status', 'delivered').gte('delivered_at', startOfPrevMonth).lt('delivered_at', startOfMonth),
    supabase.from('jobs').select('status, quote_value'),
    supabase.from('jobs').select('quote_value, delivered_at').in('status', ['delivered', 'archived']).gte('delivered_at', twelveMonthsAgo),
    supabase.from('clients').select('id, name, monthly_retainer, shoots_per_month').eq('client_category', 'retainer'),
    // Shoots that are ACTUALLY booked. This replaces a cadence guess: the old
    // version derived "upcoming shoots" from shoots_per_month via a SHOOT_WEEKS
    // table, inventing dates nobody had agreed to. A real calendar entry is the
    // only thing that means a shoot is happening.
    supabase
      .from('events')
      .select('id, title, date, start_time, job_id, jobs(id, name, clients(id, name))')
      .eq('event_type', 'shoot')
      .gte('date', todayISO)
      .order('date', { ascending: true })
      .limit(7),
  ])

  const crmRevenueThisMonth = (deliveredThisMonth ?? []).reduce((s, j) => s + (j.quote_value || 0), 0)
  const crmRevenuePrevMonth = (deliveredPrevMonth ?? []).reduce((s, j) => s + (j.quote_value || 0), 0)

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
  const crmChartMonths = months.map((m, i) => {
    if (i === 11) return { ...m, value: crmRevenueThisMonth }
    if (i === 10) return { ...m, value: crmRevenuePrevMonth }
    return m
  })

  const mrr = (retainerClients ?? []).reduce(
    (s, c) => s + ((c as { monthly_retainer?: number }).monthly_retainer || 0), 0
  )
  const pipelineValue = (pipelineJobs ?? [])
    .filter((j) => !['delivered', 'archived'].includes(j.status))
    .reduce((s, j) => s + ((j as { quote_value?: number }).quote_value || 0), 0)

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
  const inFlightJobs = PIPELINE_STAGES.reduce((s, st) => s + stageCounts[st.key], 0)

  const breakdown = PIPELINE_STAGES
    .map((s, i) => ({ label: s.label, value: stageValues[s.key], color: STAGE_COLORS[i % STAGE_COLORS.length] }))
    .filter((b) => b.value > 0)

  const spmByClient = new Map(
    ((retainerClients ?? []) as unknown as { id: string; shoots_per_month: number | null }[])
      .map((c) => [c.id, c.shoots_per_month ?? 0])
  )
  const cadenceLabel = (spm: number) =>
    spm >= 4 ? 'Weekly' : spm === 3 ? '3× / month' : spm === 2 ? 'Fortnightly' : spm === 1 ? 'Monthly' : 'One-off'

  const upcomingShoots: UpcomingShoot[] = (
    (bookedShoots ?? []) as unknown as {
      id: string; title: string; date: string
      jobs: { id: string; name: string; clients: { id: string; name: string } | null } | null
    }[]
  ).map((e) => {
    const client = e.jobs?.clients ?? null
    const spm = client ? (spmByClient.get(client.id) ?? 0) : 0
    return {
      clientId: client?.id ?? '',
      clientName: client?.name ?? e.title,
      cadence: cadenceLabel(spm),
      shootsPerMonth: spm,
      dateISO: new Date(e.date).toISOString(),
      // A real booked date, not a derived "week 2 of the month".
      weekLabel: new Date(e.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }),
    }
  })

  const reportBase = { breakdown, upcomingShoots }

  const crmChangePct = crmRevenuePrevMonth > 0
    ? ((crmRevenueThisMonth - crmRevenuePrevMonth) / crmRevenuePrevMonth) * 100
    : undefined

  return (
    <div className="space-y-10">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/dashboard" className="page-breadcrumb inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Today
          </Link>
          <h1 className="page-title">Insights</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Monthly retainers" value={formatNZD(mrr)} sub={`${(retainerClients ?? []).length} client${(retainerClients ?? []).length === 1 ? '' : 's'}`} />
        <KpiCard label="Pipeline value" value={formatNZD(pipelineValue)} sub={`${inFlightJobs} in flight`} />
        <KpiCard label="Active jobs" value={String(activeJobs ?? 0)} sub={`${reviewJobs ?? 0} awaiting review`} />
        <KpiCard label="Booked shoots" value={String(upcomingShoots.length)} sub="next 7 scheduled" />
      </div>

      {/* CRM figures render immediately; the Xero-derived version swaps in
          when it arrives. See RevenueLive for why this is split. */}
      <Suspense
        fallback={
          <RevenueSection
            allMonthsData={crmChartMonths}
            revenueThisMonth={crmRevenueThisMonth}
            revenuePrevMonth={crmRevenuePrevMonth}
            changePct={crmChangePct}
            reportData={{
              ...reportBase,
              revenueThisMonth: crmRevenueThisMonth,
              revenuePrevMonth: crmRevenuePrevMonth,
              changePct: crmChangePct,
              chartData: crmChartMonths,
              source: 'Based on delivered jobs in CRM',
            }}
          />
        }
      >
        <RevenueLive
          now={now.toISOString()}
          crmChartMonths={crmChartMonths}
          crmRevenueThisMonth={crmRevenueThisMonth}
          crmRevenuePrevMonth={crmRevenuePrevMonth}
          reportBase={reportBase}
        />
      </Suspense>
    </div>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <div className="kpi-value-row">
        <span className="kpi-value">{value}</span>
      </div>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  )
}
