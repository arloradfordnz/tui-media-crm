'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { syncLifetimeValues } from '@/app/actions/clients'
import { useToast } from '@/components/Toast'
import { RefreshCw } from 'lucide-react'

// Pulls paid-invoice totals from Xero into each client's lifetime value.
//
// The result used to render as a bare <span> next to the button and then stay
// there — through a router.refresh(), through navigating away and back — until
// the page was hard-reloaded. A one-off confirmation that outlives the action
// it describes stops being a confirmation and becomes furniture, so it goes
// through the toast stack instead: bottom right, a few seconds, gone. Failures
// still use the error tone, which does not auto-dismiss, because a sync that
// did not happen is something you need to have seen.
export default function SyncLifetimeButton() {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function handleSync() {
    setBusy(true)
    const res = await syncLifetimeValues()
    setBusy(false)

    if ('error' in res && res.error) {
      toast({ tone: 'error', title: 'Could not sync from Xero', detail: res.error })
      return
    }

    if ('matched' in res) {
      const unmatched = res.unmatched.length
      toast({
        tone: 'success',
        title: `${res.updated} client${res.updated !== 1 ? 's' : ''} updated`,
        detail:
          `${res.matched} matched in Xero` +
          (unmatched > 0
            ? ` · ${unmatched} Xero contact${unmatched !== 1 ? 's' : ''} with no matching client`
            : ''),
      })
      router.refresh()
    }
  }

  return (
    <button onClick={handleSync} disabled={busy} className="btn-secondary" title="Update lifetime values from paid Xero invoices">
      <RefreshCw className={`w-4 h-4${busy ? ' animate-spin' : ''}`} /> {busy ? 'Syncing...' : 'Sync Value'}
    </button>
  )
}
