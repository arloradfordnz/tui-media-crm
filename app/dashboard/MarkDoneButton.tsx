'use client'

import { useTransition } from 'react'
import { Check } from 'lucide-react'
import { markClientEmailDone } from '@/app/actions/client-emails'

/** "I've dealt with this" on a Your week row. The row vanishes at once; if the
 *  save fails it comes back rather than silently pretending. */
export default function MarkDoneButton({ emailId }: { emailId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="btn-ghost attention-done"
      disabled={pending}
      aria-label="Mark as done"
      title="Mark as done"
      onClick={(e) => {
        const row = e.currentTarget.closest<HTMLElement>('.attention-row')
        if (row) row.style.display = 'none'
        startTransition(async () => {
          const res = await markClientEmailDone(emailId)
          if (!res.ok && row) row.style.display = ''
        })
      }}
    >
      <Check className="w-4 h-4" />
    </button>
  )
}
