'use client'

import { useState, useTransition } from 'react'
import { toggleTodo, deleteTodo } from '@/app/actions/todos'
import { CheckCircle2, Circle, Trash2 } from 'lucide-react'
import Link from 'next/link'

type TodoItemProps = {
  id: string
  title: string
  dueDate: string | null
  isOverdue: boolean
  linkedJob: { id: string; name: string } | null
  linkedClient: { id: string; name: string } | null
}

export default function TodoItem({ id, title, dueDate, isOverdue, linkedJob, linkedClient }: TodoItemProps) {
  const [checked, setChecked] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    setChecked(true)
    startTransition(async () => {
      await toggleTodo(id, true)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteTodo(id)
    })
  }

  if (checked) return null

  return (
    <div className="group flex items-start gap-3 py-2 rounded-lg px-2 -mx-2">
      <button onClick={handleToggle} disabled={isPending} className="mt-0.5 shrink-0">
        <Circle className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {linkedJob && (
            <Link href={`/dashboard/jobs/${linkedJob.id}`} className="text-xs" style={{ color: 'var(--accent)' }}>
              {linkedJob.name}
            </Link>
          )}
          {linkedClient && !linkedJob && (
            <Link href={`/dashboard/clients/${linkedClient.id}`} className="text-xs" style={{ color: 'var(--accent)' }}>
              {linkedClient.name}
            </Link>
          )}
          {dueDate && (
            <span className="text-xs" style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)' }}>
              {isOverdue ? 'Overdue · ' : ''}{(() => { const d = new Date(dueDate); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}` })()}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Delete todo"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
