import Image from 'next/image'
import { DollarSign } from 'lucide-react'

export default function FinancePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Image src="/Primary_White.svg" alt="Tui Media" width={160} height={34} className="mb-8" style={{ height: 'auto' }} />

      <DollarSign className="w-12 h-12 mb-4" style={{ color: 'var(--accent)' }} />

      <h1 className="text-2xl font-semibold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
        Financial Dashboard
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Coming soon &mdash; Xero integration in progress
      </p>

      <div className="card max-w-md text-left">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          This module will show revenue, outstanding invoices, expenses, and P&L once connected to Xero.
        </p>
      </div>

      <button className="btn-primary mt-6" disabled style={{ opacity: 0.6 }}>
        <DollarSign className="w-4 h-4" /> Connect Xero
      </button>
    </div>
  )
}
