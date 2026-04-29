import { DollarSign, AlertCircle, Plug, Wallet, FileText, TrendingUp } from 'lucide-react'
import { fetchXeroSummary, type XeroSummary } from '@/lib/xero'
import { formatNZD } from '@/lib/format'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ xero?: string; xero_error?: string }>

function StatTile({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div className="text-2xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  )
}

function NotConnected({ error }: { error?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <img src="/Xero_software_logo.svg.png" alt="Xero" width={120} height={120} className="mb-6" style={{ objectFit: 'contain' }} />
      <h1 className="text-2xl font-semibold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
        Financial Dashboard
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Connect your Xero account to pull revenue, outstanding invoices and bank balance into the daily AI health report.
      </p>
      {error && (
        <div className="card max-w-md mb-4 flex items-start gap-2 text-left" style={{ borderColor: 'var(--danger)' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Couldn&apos;t connect</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{decodeURIComponent(error)}</p>
          </div>
        </div>
      )}
      <a href="/api/auth/xero/start" className="btn-primary">
        <Plug className="w-4 h-4" /> Connect Xero
      </a>
      <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
        You&apos;ll be redirected to Xero to authorise read-only access.
      </p>
    </div>
  )
}

function Connected({ summary }: { summary: XeroSummary }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Finance</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Live snapshot from <span style={{ color: 'var(--text-primary)' }}>{summary.org_name ?? 'Xero'}</span>.
          </p>
        </div>
        <form action="/api/auth/xero/disconnect" method="post">
          <button type="submit" className="btn-secondary text-xs">Disconnect</button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={TrendingUp}
          label="Revenue (MTD)"
          value={summary.revenue_this_month_nzd == null ? '—' : formatNZD(summary.revenue_this_month_nzd)}
        />
        <StatTile
          icon={DollarSign}
          label="Net Profit (MTD)"
          value={summary.net_profit_this_month_nzd == null ? '—' : formatNZD(summary.net_profit_this_month_nzd)}
        />
        <StatTile
          icon={FileText}
          label="Outstanding"
          value={formatNZD(summary.outstanding_invoices_nzd)}
          sub={`${summary.outstanding_invoice_count} invoice${summary.outstanding_invoice_count === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={AlertCircle}
          label="Overdue"
          value={formatNZD(summary.overdue_invoices_nzd)}
          sub={`${summary.overdue_invoice_count} invoice${summary.overdue_invoice_count === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={Wallet}
          label="Bank Balance"
          value={summary.bank_balance_nzd == null ? '—' : formatNZD(summary.bank_balance_nzd)}
        />
      </div>

      <div className="card">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          These figures are pulled fresh on every page load and feed into the AI Business Health summary on the dashboard each morning.
        </p>
      </div>
    </div>
  )
}

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  let summary: XeroSummary | null = null
  let fetchError: string | null = null
  try {
    summary = await fetchXeroSummary()
  } catch (e) {
    fetchError = (e as Error).message
  }

  if (!summary) {
    return <NotConnected error={params.xero_error ?? fetchError ?? undefined} />
  }
  return <Connected summary={summary} />
}
