'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { syncLifetimeValues } from '@/app/actions/clients'
import { RefreshCw } from 'lucide-react'

// Pulls paid-invoice totals from Xero into each client's lifetime value.
export default function SyncLifetimeButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function handleSync() {
    setBusy(true)
    setNote(null)
    const res = await syncLifetimeValues()
    setBusy(false)
    if ('error' in res && res.error) {
      setNote(res.error)
      return
    }
    if ('matched' in res) {
      const extra = res.unmatched.length > 0 ? ` · ${res.unmatched.length} Xero contact${res.unmatched.length !== 1 ? 's' : ''} with no matching client` : ''
      setNote(`${res.matched} client${res.matched !== 1 ? 's' : ''} matched, ${res.updated} updated${extra}`)
      router.refresh()
    }
  }

  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{note}</span>}
      <button onClick={handleSync} disabled={busy} className="btn-secondary" title="Update lifetime values from paid Xero invoices">
        <RefreshCw className={`w-4 h-4${busy ? ' animate-spin' : ''}`} /> {busy ? 'Syncing...' : 'Sync Value'}
      </button>
    </div>
  )
}
