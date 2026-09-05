'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { deleteAllDocuments } from '@/app/actions/clients'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'

export default function ClearAllButton({ count }: { count: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)

  function handleClear() {
    setConfirm({
      title: `Delete all ${count} document${count === 1 ? '' : 's'}?`,
      body: 'Every saved document goes, including invoices and contracts. There is no undo.',
      confirmLabel: 'Delete everything',
      destructive: true,
      onConfirm: () => {
        setError(null)
        startTransition(async () => {
          const result = await deleteAllDocuments()
          if ('error' in result) {
            setError(result.error)
            return
          }
          router.refresh()
        })
      },
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClear}
        disabled={pending || count === 0}
        className="btn-secondary text-xs"
        style={{ color: 'var(--danger)' }}
      >
        <Trash2 className="w-3.5 h-3.5" /> {pending ? 'Clearing...' : `Clear all (${count})`}
      </button>
      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
    </div>
  )
}
