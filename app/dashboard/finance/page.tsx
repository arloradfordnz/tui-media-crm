import { AlertCircle, Plug } from 'lucide-react'
import { fetchXeroSummary, fetchXeroTransactions, type XeroSummary, type XeroTransaction } from '@/lib/xero'
import FinanceDashboard from './FinanceDashboard'
import { getAppSetting } from '@/app/actions/settings'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ xero?: string; xero_error?: string }>

function NotConnected({ error }: { error?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <img src="/Xero_software_logo.svg.png" alt="Xero" width={120} height={120} className="mb-6" style={{ objectFit: 'contain' }} />
      <h1 className="text-2xl font-semibold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
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
  let fetchError: string | null = null
  let retainerInvoiceDay: number | undefined
  try {
    const [s, t, dayStr] = await Promise.all([fetchXeroSummary(), fetchXeroTransactions(), getAppSetting('retainer_invoice_day')])
    summary = s
    transactions = t ?? []
    retainerInvoiceDay = dayStr ? parseInt(dayStr, 10) : 1
  } catch (e) {
    fetchError = (e as Error).message
  }

  if (!summary) {
    return <NotConnected error={params.xero_error ?? fetchError ?? undefined} />
  }
  return <FinanceDashboard summary={summary} transactions={transactions} retainerInvoiceDay={retainerInvoiceDay} />
}
