'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { createTodo, toggleTodo, deleteTodo } from '@/app/actions/todos'
import { CheckSquare, CheckCircle2, Circle, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'

type Todo = {
  id: string
  title: string
  completed: boolean
  due_date: string | null
  linked_job_id: string | null
  linked_client_id: string | null
  created_at: string
  jobs: { id: string; name: string } | null
  clients: { id: string; name: string } | null
}

type Job = { id: string; name: string }
type Client = { id: string; name: string }

const FILTERS = [
  { value: 'todo', label: 'To Do' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

function TodoRow({ todo, now }: { todo: Todo; now: Date }) {
  const [isPending, startTransition] = useTransition()
  const [optimisticDone, setOptimisticDone] = useState(todo.completed)

  const job = todo.jobs as { id: string; name: string } | null
  const client = todo.clients as { id: string; name: string } | null
  const isOverdue = !todo.completed && !!todo.due_date && new Date(todo.due_date) < now

  function handleToggle() {
    const next = !optimisticDone
    setOptimisticDone(next)
    startTransition(async () => {
      await toggleTodo(todo.id, next)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteTodo(todo.id)
    })
  }

  return (
    <div
      className="group flex items-start gap-3 py-3 px-4 rounded-lg"
      style={{ background: 'var(--bg-elevated)', opacity: isPending ? 0.6 : 1 }}
    >
      <button onClick={handleToggle} disabled={isPending} className="mt-0.5 shrink-0">
        {optimisticDone
          ? <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--success)' }} />
          : <Circle className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm"
          style={{
            color: optimisticDone ? 'var(--text-tertiary)' : 'var(--text-primary)',
            textDecoration: optimisticDone ? 'line-through' : 'none',
          }}
        >
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {job && (
            <Link href={`/dashboard/jobs/${job.id}`} className="text-xs" style={{ color: 'var(--accent)' }}>
              {job.name}
            </Link>
          )}
          {client && !job && (
            <Link href={`/dashboard/clients/${client.id}`} className="text-xs" style={{ color: 'var(--accent)' }}>
              {client.name}
            </Link>
          )}
          {todo.due_date && (
            <span className="text-xs" style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)' }}>
              {isOverdue ? 'Overdue · ' : ''}
              {new Date(todo.due_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleDelete}
        disabled={isPending}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

function CreateForm({ jobs, clients }: { jobs: Job[]; clients: Client[] }) {
  const [state, action, isPending] = useActionState(createTodo, undefined)
  const [showExtra, setShowExtra] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!isPending && !state?.error) {
      formRef.current?.reset()
      setShowExtra(false)
    }
  }, [isPending, state])

  return (
    <form ref={formRef} action={action} className="card space-y-3">
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <input
          name="title"
          type="text"
          placeholder="New to-do…"
          autoComplete="off"
          required
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
          disabled={isPending}
        />
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="text-xs flex items-center gap-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {showExtra ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showExtra ? 'Less' : 'More'}
        </button>
        <button type="submit" className="btn-primary text-sm" disabled={isPending}>
          Add
        </button>
      </div>

      {showExtra && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1" style={{ borderTop: '1px solid var(--bg-border)' }}>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Due date</label>
            <input
              name="due_date"
              type="date"
              className="input text-sm w-full"
              disabled={isPending}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Link to job</label>
            <select name="linked_job_id" className="input text-sm w-full" disabled={isPending}>
              <option value="">None</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Link to client</label>
            <select name="linked_client_id" className="input text-sm w-full" disabled={isPending}>
              <option value="">None</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {state?.error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>
      )}
    </form>
  )
}

export default function TodosView({ todos, jobs, clients, filter }: {
  todos: Todo[]
  jobs: Job[]
  clients: Client[]
  filter: string
}) {
  const now = new Date()

  const filtered = todos.filter((t) => {
    if (filter === 'todo') return !t.completed
    if (filter === 'done') return t.completed
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    const aOverdue = !a.completed && a.due_date && new Date(a.due_date) < now ? 0 : 1
    const bOverdue = !b.completed && b.due_date && new Date(b.due_date) < now ? 0 : 1
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    if (a.due_date) return -1
    if (b.due_date) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const doneCount = todos.filter((t) => t.completed).length
  const todoCount = todos.filter((t) => !t.completed).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>To Do</h1>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span>{todoCount} remaining</span>
          {doneCount > 0 && <span>· {doneCount} done</span>}
        </div>
      </div>

      <CreateForm jobs={jobs} clients={clients} />

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/dashboard/todos?filter=${f.value}`}
            className="btn-secondary text-sm"
            style={filter === f.value ? { background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="card text-center py-10">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {filter === 'done' ? 'Nothing completed yet.' : 'All caught up!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((t) => (
            <TodoRow key={t.id} todo={t} now={now} />
          ))}
        </div>
      )}
    </div>
  )
}
