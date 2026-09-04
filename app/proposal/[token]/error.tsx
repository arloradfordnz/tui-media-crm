'use client'

import { useEffect } from 'react'

// Client-facing boundary. The reader here is a paying client, not the owner,
// so the copy carries no jargon, no digest, and no "try again" that implies
// they did something wrong — just a way back in and a real person to contact.
export default function ProposalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[proposal] Unhandled error:', error)
  }, [error])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-sm text-center animate-fade-in">
        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
          This page didn&apos;t load
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Your proposal is safe. Something on our end stopped the page from loading, so please try
          once more. If it happens again, email{' '}
          <a href="mailto:hello@tuimedia.nz" style={{ color: 'var(--accent)' }}>hello@tuimedia.nz</a>{' '}
          and we&apos;ll sort it out.
        </p>
        <button type="button" className="btn-primary" onClick={() => unstable_retry()}>
          Reload the page
        </button>
      </div>
    </div>
  )
}
