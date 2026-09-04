'use client'

import { useEffect } from 'react'
import { RotateCw } from 'lucide-react'

// Route-level error boundary for the whole dashboard. It sits inside
// app/dashboard/layout.tsx, so the sidebar and shell survive a thrown error
// and only the content area is replaced — previously any throw took the
// entire app down to a blank screen.
//
// Next 16 passes `unstable_retry`, not the `reset` of earlier versions
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] Unhandled error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <div className="card animate-fade-in" style={{ maxWidth: 460, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>That screen didn&apos;t load</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          Something broke while building this page. Nothing you did caused it, and no data was
          lost. Try again, and if it keeps happening the details are in the browser console.
        </p>

        <div className="flex gap-2 justify-center">
          <button type="button" className="btn-primary" onClick={() => unstable_retry()}>
            <RotateCw className="w-4 h-4" /> Try again
          </button>
          <a href="/dashboard" className="btn-secondary">Back to dashboard</a>
        </div>

        {error.digest && (
          <p
            className="mono"
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
