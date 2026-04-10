import { DollarSign } from 'lucide-react'

export default function FinancePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <img src="/Xero_software_logo.svg.png" alt="Xero" width={120} height={120} className="mb-6" style={{ objectFit: 'contain' }} />

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
