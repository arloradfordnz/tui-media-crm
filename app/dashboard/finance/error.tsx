'use client'

import { useEffect } from 'react'
import { RotateCw } from 'lucide-react'

// Finance gets its own boundary because it is the route most likely to throw:
// it depends on a live Xero token that expires, and on a connection the owner
// can revoke from Xero's side at any time. Catching it here keeps the failure
// scoped to Finance instead of bubbling to the dashboard boundary, and lets
// the copy name the actual likely cause.
export default function FinanceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[finance] Unhandled error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <div className="card animate-fade-in" style={{ maxWidth: 460, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Finance couldn&apos;t load</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          This usually means the Xero connection expired or was disconnected. Reconnecting from
          Settings fixes it. Your invoices in Xero are untouched either way.
        </p>

        <div className="flex gap-2 justify-center">
          <button type="button" className="btn-primary" onClick={() => unstable_retry()}>
            <RotateCw className="w-4 h-4" /> Try again
          </button>
          <a href="/dashboard/settings" className="btn-secondary">Open settings</a>
        </div>

        {error.digest && (
          <p
            style={{
              marginTop: 18,
              fontSize: 11,
              color: 'var(--text-tertiary)',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
