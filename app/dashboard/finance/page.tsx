import { AlertCircle, Plug } from 'lucide-react'
import Image from 'next/image'
import { fetchXeroSummaryCached, fetchXeroTransactionsCached, fetchMonthlyPnlCached, type XeroSummary, type XeroTransaction, type MonthlyPnl } from '@/lib/xero'
import FinanceDashboard from './FinanceDashboard'
import { getAppSetting } from '@/app/actions/settings'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ xero?: string; xero_error?: string }>

function NotConnected({ error }: { error?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Image src="/Xero_software_logo.svg.png" alt="Xero" width={120} height={120} className="mb-6" style={{ objectFit: 'contain' }} />
      <h1 className="page-title mb-2">
        Financial Dashboard
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Connect your Xero account to pull revenue, outstanding invoices and bank balance.
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

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  let summary: XeroSummary | null = null
  let transactions: XeroTransaction[] = []
  let monthly: MonthlyPnl[] = []
  let fetchError: string | null = null
  let retainerInvoiceDay: number | undefined
  try {
    const [s, t, m, dayStr] = await Promise.all([
      fetchXeroSummaryCached(),
      fetchXeroTransactionsCached(),
      fetchMonthlyPnlCached(36),
      getAppSetting('retainer_invoice_day'),
    ])
    summary = s
    transactions = t ?? []
    monthly = m ?? []
    retainerInvoiceDay = dayStr ? parseInt(dayStr, 10) : 1
  } catch (e) {
    fetchError = (e as Error).message
    console.error('[Finance] Xero fetch failed:', e)
  }

  if (!summary) {
    // A null summary with no thrown error means no connected_accounts row OR a
    // failed token refresh (Xero refresh tokens lapse after 60 days unused) —
    // both land on the reconnect screen, so say which one it likely is.
    const reason = params.xero_error
      ?? fetchError
      ?? 'No active Xero connection found — if you connected before, the login may have expired. Reconnect below.'
    return <NotConnected error={reason} />
  }
  return <FinanceDashboard summary={summary} transactions={transactions}
      monthly={monthly} retainerInvoiceDay={retainerInvoiceDay} />
}
