'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { createTodo, toggleTodo, deleteTodo, updateTodo } from '@/app/actions/todos'
import { CheckSquare, CheckCircle2, Circle, Trash2, Plus, SlidersHorizontal, Pencil, X, Check } from 'lucide-react'
import Link from 'next/link'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'
import FilterTabs from '@/components/FilterTabs'

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
  { value: 'overdue', label: 'Overdue' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

function TodoRow({ todo, now, jobs, clients }: { todo: Todo; now: Date; jobs: Job[]; clients: Client[] }) {
  const [isPending, startTransition] = useTransition()
  const [optimisticDone, setOptimisticDone] = useState(todo.completed)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(todo.title)
  const [dueDate, setDueDate] = useState(todo.due_date ? todo.due_date.slice(0, 10) : '')
  const [jobId, setJobId] = useState(todo.linked_job_id || '')
  const [clientId, setClientId] = useState(todo.linked_client_id || '')
  const [error, setError] = useState<string | null>(null)

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

  function openEdit() {
    setTitle(todo.title)
    setDueDate(todo.due_date ? todo.due_date.slice(0, 10) : '')
    setJobId(todo.linked_job_id || '')
    setClientId(todo.linked_client_id || '')
    setError(null)
    setEditing(true)
  }

  function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    startTransition(async () => {
      const res = await updateTodo(todo.id, {
        title,
        due_date: dueDate || null,
        linked_job_id: jobId || null,
        linked_client_id: clientId || null,
      })
      if (res && 'error' in res && res.error) { setError(res.error); return }
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <div
        className="flex flex-col gap-3 py-3 px-4 rounded-lg"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', opacity: isPending ? 0.6 : 1 }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="Title"
          className="field-input"
          style={{ padding: '8px 12px' }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Due date</label>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              className="field-input"
              style={{ padding: '8px 12px' }}
            />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Link to job</label>
            <CustomSelect
              value={jobId}
              onChange={setJobId}
              placeholder="None"
              searchable
              options={[{ value: '', label: 'None' }, ...jobs.map((j) => ({ value: j.id, label: j.name }))]}
            />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Link to client</label>
            <CustomSelect
              value={clientId}
              onChange={setClientId}
              placeholder="None"
              searchable
              options={[{ value: '', label: 'None' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEditing(false)} className="btn-secondary text-sm" disabled={isPending}>
            <X className="w-4 h-4" /> Cancel
          </button>
          <button onClick={handleSave} className="btn-primary text-sm" disabled={isPending}>
            <Check className="w-4 h-4" /> {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
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

      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
        <button
          onClick={openEdit}
          disabled={isPending}
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={handleDelete}
          disabled={isPending}
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
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
    <form ref={formRef} action={action} className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="flex items-center gap-2 px-4 py-3">
        <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <input
          name="title"
          type="text"
          placeholder="Add a to-do…"
          autoComplete="off"
          required
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
          disabled={isPending}
        />
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="btn-icon"
          title={showExtra ? 'Hide options' : 'More options'}
          aria-label={showExtra ? 'Hide options' : 'More options'}
          style={{ color: showExtra ? 'var(--accent)' : 'var(--text-tertiary)' }}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
        <button type="submit" className="btn-primary text-sm" disabled={isPending} style={{ padding: '8px 16px' }}>
          Add
        </button>
      </div>

      {showExtra && (
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3 animate-fade-in"
          style={{ borderTop: '1px solid var(--bg-border)', background: 'var(--bg-elevated)' }}
        >
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Due date</label>
            <DatePicker
              name="due_date"
              className="field-input"
              disabled={isPending}
              style={{ padding: '8px 12px' }}
            />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Link to job</label>
            <CustomSelect
              name="linked_job_id"
              placeholder="None"
              searchable
              options={[{ value: '', label: 'None' }, ...jobs.map((j) => ({ value: j.id, label: j.name }))]}
              disabled={isPending}
            />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Link to client</label>
            <CustomSelect
              name="linked_client_id"
              placeholder="None"
              searchable
              options={[{ value: '', label: 'None' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
              disabled={isPending}
            />
          </div>
        </div>
      )}

      {state?.error && (
        <p className="text-sm px-4 py-2" style={{ color: 'var(--danger)' }}>{state.error}</p>
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
    if (filter === 'overdue') return !t.completed && !!t.due_date && new Date(t.due_date) < now
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

      <FilterTabs options={FILTERS} paramName="filter" defaultValue="todo" />

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
            <TodoRow key={t.id} todo={t} now={now} jobs={jobs} clients={clients} />
          ))}
        </div>
      )}
    </div>
  )
}
