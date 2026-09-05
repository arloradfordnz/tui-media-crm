'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

// Replaces window.confirm() on the moments that matter most.
//
// Approve, request-revision and sign are the three highest-stakes actions in
// the whole client relationship, and every one of them ran through a native
// confirm(): a grey OS dialog with your bare domain at the top, no branding,
// and copy the browser styles however it likes. It reads like a security
// warning at the exact moment you want the client to feel confident.
//
// Bottom sheet on a phone (thumb-reachable), centred dialog from 640px up.
export type ConfirmSpec = {
  title: string
  body: string
  /** Label for the action itself — "Approve", not "OK". */
  confirmLabel: string
  cancelLabel?: string
  /** Renders the primary action in the danger colour. */
  destructive?: boolean
  onConfirm: () => void
}

export default function ConfirmSheet({
  spec,
  onClose,
}: {
  spec: ConfirmSpec | null
  onClose: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Escape closes, and focus lands on the primary action so the sheet is
  // operable from the keyboard without hunting for it.
  useEffect(() => {
    if (!spec) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    confirmRef.current?.focus()
    // The page behind must not scroll while a sheet is up — on iOS that
    // otherwise scrolls the body under the overlay.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [spec, onClose])

  if (!spec) return null

  return (
    <div
      className="confirm-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="confirm-sheet">
        {spec.destructive && (
          <span className="confirm-icon" aria-hidden="true">
            <AlertTriangle className="w-4 h-4" />
          </span>
        )}
        <h2 id="confirm-title" className="confirm-title">{spec.title}</h2>
        <p className="confirm-body">{spec.body}</p>
        <div className="confirm-actions">
          <button type="button" className="btn-secondary confirm-cancel" onClick={onClose}>
            {spec.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={spec.destructive ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              spec.onConfirm()
              onClose()
            }}
          >
            {spec.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
