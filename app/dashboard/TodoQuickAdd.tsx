'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createTodo } from '@/app/actions/todos'
import { Plus } from 'lucide-react'

export default function TodoQuickAdd() {
  const [state, action, isPending] = useActionState(createTodo, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!isPending && !state?.error) {
      formRef.current?.reset()
    }
  }, [isPending, state])

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2 mb-3">
      <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
      <input
        name="title"
        type="text"
        placeholder="Add a to-do…"
        autoComplete="off"
        className="flex-1 bg-transparent text-sm outline-none"
        style={{ color: 'var(--text-primary)' }}
        disabled={isPending}
      />
      <button type="submit" className="sr-only">Add</button>
    </form>
  )
}
