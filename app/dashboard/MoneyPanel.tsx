import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { fetchMonthlyPnlCached, fetchOutstandingInvoicesCached, fetchXeroTransactionsCached } from '@/lib/xero'
import { createServerSupabaseClient } from '@/lib/supabase'
import { buildMonthForecast, type MonthForecast } from '@/lib/month-forecast'
import MoneyMiniChart from './MoneyMiniChart'
import TransactionsCard, { TxSkeleton, type RecentTx } from './TransactionsCard'

/**
 * The home screen's money graph: six months of in against out.
 *
 * This page deliberately does not block on Xero — a cold token refresh is the
 * slowest thing in the app and this is the page opened most often — so it is
 * rendered inside a <Suspense> on the dashboard and STREAMS in behind the rest
 * of the screen. First paint is unchanged; the chart lands a moment later.
 *
 * In and Out click to isolate their line, the same as on Finance — a figure
 * that looks identical to one on another page has to behave like it. What
 * this panel still does NOT carry is the range control, the table and the
 * transaction list: those are the reasons to open Finance.
 */

const MONTHS = 6
// More than the tallest column will ever show; the list trims to what fits.
const RECENT_TX = 16

const NZ_TZ = 'Pacific/Auckland'

/**
 * `fill`: the panel stretches to take whatever height its column has spare and
 * the chart grows to match, so the dashboard's two columns finish level however
 * long the right-hand one gets. The CSS that does the stretching only applies
 * at the two-column width; stacked, the chart is its usual 240px.
 */
export default async function MoneyPanel({ fill = false }: { fill?: boolean } = {}) {
  // Both from Xero's cached tier, fetched together so the transactions cost
  // no extra wait. Xero being down is not a reason for the home screen to be.
  // The forecast's CRM reads ride in the same wave.
  const supabase = await createServerSupabaseClient()
  const [monthly, txs, outstanding, jobsRes, retainersRes, invoiceDayRes] = await Promise.all([
    fetchMonthlyPnlCached(MONTHS).catch(() => null),
    fetchXeroTransactionsCached().catch(() => null),
    fetchOutstandingInvoicesCached().catch(() => null),
    supabase
      .from('jobs')
      .select('status, quote_value, expected_amount, expected_payment_date, shoot_date, paid_at, clients(name)')
      .is('paid_at', null)
      .not('status', 'in', '("enquiry","archived")'),
    supabase
      .from('clients')
      .select('monthly_retainer, retainer_paused_from')
      .eq('status', 'active')
      .gt('monthly_retainer', 0),
    supabase.from('app_settings').select('value').eq('key', 'retainer_invoice_day').maybeSingle(),
  ])

  // Already newest-first. Invoices raised ahead of time carry a future date,
  // and a "recent" list that leads with December is not recent, so those wait.
  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: NZ_TZ })

  // Only when Xero answered: a forecast missing the money already in would
  // understate the month and look like bad news.
  const forecast: MonthForecast | null = monthly && outstanding
    ? buildMonthForecast({
        todayISO,
        receivedThisMonth: monthly.find((m) => m.month === todayISO.slice(0, 7))?.income ?? 0,
        outstanding,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jobs: (jobsRes.data ?? []) as any,
        retainers: retainersRes.data ?? [],
        retainerInvoiceDay: parseInt(invoiceDayRes.data?.value ?? '1', 10) || 1,
      })
    : null
  // null means Xero could not be read, which is different from "nothing new".
  const recent: RecentTx[] | null = txs && txs
    .filter((t) => t.date <= todayISO)
    .slice(0, RECENT_TX)
    .map(({ id, date, type, description, reference, status, amount }) => ({ id, date, type, description, reference, status, amount }))

  if (!monthly || monthly.length === 0) {
    return (
      <Shell fill={fill}>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          No Xero figures yet. <Link href="/dashboard/finance" style={{ color: 'var(--accent)' }}>Connect Xero</Link> to see money
          in against money out here.
        </p>
      </Shell>
    )
  }

  const rows = monthly.slice(-MONTHS)
  const inData = rows.map((m) => ({ label: m.label, value: m.income }))
  const outData = rows.map((m) => ({ label: m.label, value: m.expenses }))
  const net = rows.reduce((a, m) => a + m.income - m.expenses, 0)

  return (
    <Shell fill={fill}>
      {/* Figures and chart are one client component: the figures toggle which
          line is isolated, so they have to share that state with the chart. */}
      {forecast && <ForecastStrip f={forecast} />}
      <MoneyMiniChart inData={inData} outData={outData} net={net} fill={fill} />
      <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
        Up to the last {rows.length} months, from Xero.
      </p>
      {/* Same card: in fill mode the chart and this list share its spare
          height. */}
      <TransactionsCard transactions={recent} fill={fill} />
    </Shell>
  )
}

const nzd = (n: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n)

/** One line and one bar: the month's likely income, split into what is in,
 *  what is invoiced and what is still to come. See lib/month-forecast.ts. */
function ForecastStrip({ f }: { f: MonthForecast }) {
  const parts = [
    { key: 'received', label: 'In', value: f.received, colour: 'var(--success)' },
    { key: 'invoiced', label: 'Invoiced', value: f.invoiced, colour: 'var(--accent)' },
    { key: 'expected', label: 'To come', value: f.expected, colour: 'var(--accent-muted)' },
  ]
  const title = parts.map((p) => `${p.label} ${nzd(p.value)}`).join(' · ')
  return (
    <div className="forecast-strip" title={title}>
      <div className="forecast-head">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{f.monthLabel} forecast</span>
        <span className="forecast-total tabular-nums">{nzd(f.total)}</span>
      </div>
      <div className="forecast-bar" role="img" aria-label={`${f.monthLabel} forecast ${nzd(f.total)}: ${title}`}>
        {f.total > 0 && parts.map((p) => p.value > 0 && (
          <span key={p.key} style={{ flexGrow: p.value, background: p.colour }} />
        ))}
      </div>
      <div className="forecast-legend tabular-nums">
        {parts.map((p) => (
          <span key={p.key}>
            <span className="legend-dot" style={{ background: p.colour }} />
            {p.label} {nzd(p.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Shell({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <section className={`today-money${fill ? ' money-fill' : ''}`}>
      <div className="section-head">
        <h2 className="section-heading">Money</h2>
        <Link href="/dashboard/finance" className="section-head-meta" style={{ color: 'var(--accent)' }}>
          Finance <ArrowUpRight className="w-3 h-3 inline" />
        </Link>
      </div>
      <div className="card">{children}</div>
    </section>
  )
}

export function MoneyPanelSkeleton({ fill = false }: { fill?: boolean } = {}) {
  return (
    <Shell fill={fill}>
      {/* Forecast strip, then the same three figures over the same chart box
          as the real panel, so the Xero wait does not end in the card
          changing height. */}
      <div className="forecast-strip">
        <div className="forecast-head">
          <div className="skeleton" style={{ width: 110, height: 12 }} />
          <div className="skeleton" style={{ width: 64, height: 16 }} />
        </div>
        <div className="skeleton" style={{ height: 6, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: 220, height: 11 }} />
      </div>
      <div className="money-mini-figures">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton" style={{ width: 44, height: 11 }} />
            <div className="skeleton" style={{ width: 78, height: 20 }} />
          </div>
        ))}
      </div>
      <div className="money-mini-fill">
        <div className="money-chart-slot">
          <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 12 }} />
        </div>
      </div>
      <TxSkeleton fill={fill} />
    </Shell>
  )
}

