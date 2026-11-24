'use client'

import { useTransition } from 'react'
import { Check, Clock } from 'lucide-react'
import { putAwayAttention, logInstagramPost } from '@/app/actions/client-emails'

/** Done and Snooze on a Your week row. Every row has both, so nothing has to
 *  sit on the home screen until it is ignored. The row vanishes at once; if
 *  the save fails it comes back rather than silently pretending.
 *
 *  Done ticks an overdue task, marks a client email answered, and otherwise
 *  puts the row away until the thing it is about changes. Snooze hides it for
 *  a week. */
export default function RowControls({
  itemKey,
  taskId,
  emailId,
  post,
}: {
  itemKey: string
  taskId?: string
  emailId?: string
  /** The Instagram row: Done logs today's post rather than hiding the row. */
  post?: boolean
}) {
  const [pending, startTransition] = useTransition()

  const act = (e: React.MouseEvent<HTMLButtonElement>, snooze: boolean) => {
    const row = e.currentTarget.closest<HTMLElement>('.attention-row')
    if (row) row.style.display = 'none'
    startTransition(async () => {
      const res = post && !snooze
        ? await logInstagramPost()
        : await putAwayAttention(itemKey, { snooze, taskId, emailId })
      if (!res.ok && row) row.style.display = ''
    })
  }

  const doneLabel = post ? 'Posted it' : taskId ? 'Mark task done' : emailId ? 'Mark as answered' : 'Done, hide this'

  return (
    <>
      <button
        type="button"
        className="btn-ghost attention-done"
        disabled={pending}
        aria-label="Snooze for a week"
        title="Snooze for a week"
        onClick={(e) => act(e, true)}
      >
        <Clock className="w-4 h-4" />
      </button>
      <button
        type="button"
        className="btn-ghost attention-done"
        disabled={pending}
        aria-label={doneLabel}
        title={doneLabel}
        onClick={(e) => act(e, false)}
      >
        <Check className="w-4 h-4" />
      </button>
    </>
  )
}
