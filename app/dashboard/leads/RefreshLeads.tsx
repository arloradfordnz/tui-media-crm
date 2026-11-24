'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { refreshLeads } from '@/app/actions/leads'

export default function RefreshLeads() {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-3">
      {note && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{note}</span>}
      <button
        type="button"
        className="btn-secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await refreshLeads()
            setNote(res.ok ? `Read ${res.leads} from the mailbox` : res.error ?? 'Could not read the mailbox')
          })
        }
      >
        <RefreshCw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Reading mail…' : 'Check mail'}
      </button>
    </div>
  )
}
