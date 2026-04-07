'use client'

import { useState, useTransition } from 'react'
import { toggleTask } from '@/app/actions/jobs'
import { CheckCircle2, Circle } from 'lucide-react'

export default function TodoCheckbox({ taskId }: { taskId: string }) {
  const [checked, setChecked] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    setChecked(true)
    startTransition(async () => {
      await toggleTask(taskId, true)
    })
  }

  return (
    <button onClick={handleToggle} disabled={checked || isPending} className="mt-0.5 shrink-0">
      {checked ? (
        <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--success)' }} />
      ) : (
        <Circle className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
      )}
    </button>
  )
}
