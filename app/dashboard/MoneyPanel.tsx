import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { fetchMonthlyPnlCached } from '@/lib/xero'
import MoneyMiniChart from './MoneyMiniChart'

/**
 * The home screen's money graph: six months of in against out, and nothing
 * you can click inside it.
 *
 * This page deliberately does not block on Xero — a cold token refresh is the
 * slowest thing in the app and this is the page opened most often — so it is
 * rendered inside a <Suspense> on the dashboard and STREAMS in behind the rest
 * of the screen. First paint is unchanged; the chart lands a moment later.
 *
 * Everything you can do with the figures (change the range, focus one line,
 * read the table, drill into transactions) lives on Finance. A second copy of
 * those controls here would be two answers to the same question.
 */

const MONTHS = 6

const fmtBig = (n: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n)

export default async function MoneyPanel() {
  let monthly: Awaited<ReturnType<typeof fetchMonthlyPnlCached>> = null
  try {
    monthly = await fetchMonthlyPnlCached(MONTHS)
  } catch {
    // Xero being down is not a reason for the home screen to be down.
    monthly = null
  }

  if (!monthly || monthly.length === 0) {
    return (
      <Shell>
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
  const inTotal = rows.reduce((a, m) => a + m.income, 0)
  const outTotal = rows.reduce((a, m) => a + m.expenses, 0)
  const net = inTotal - outTotal

  return (
    <Shell>
      <div className="money-mini-figures">
        <Figure label="In" value={fmtBig(inTotal)} colour="var(--accent)" />
        <Figure label="Out" value={fmtBig(outTotal)} colour="var(--chart-out)" />
        <Figure
          label="Net"
          value={fmtBig(net)}
          colour={net < 0 ? 'var(--danger)' : 'var(--success)'}
          tone={net < 0 ? 'var(--danger)' : undefined}
        />
      </div>
      <MoneyMiniChart inData={inData} outData={outData} />
      <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
        Up to the last {rows.length} months, from Xero. The chart drops the
        oldest months when the column is too narrow to label them all.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section>
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

function Figure({ label, value, colour, tone }: { label: string; value: string; colour: string; tone?: string }) {
  return (
    <div>
      <span className="flex items-center gap-2">
        <span className="legend-dot" style={{ background: colour }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </span>
      <span
        className="block text-xl font-semibold tabular-nums mt-1"
        style={{ letterSpacing: '-0.02em', color: tone ?? 'var(--text-primary)', lineHeight: 1 }}
      >
        {value}
      </span>
    </div>
  )
}

export function MoneyPanelSkeleton() {
  return (
    <Shell>
      <div className="skeleton" style={{ height: 240, borderRadius: 12 }} />
    </Shell>
  )
}
