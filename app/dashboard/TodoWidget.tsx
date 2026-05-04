import { createServerSupabaseClient } from '@/lib/supabase'
import { CheckSquare, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import TodoItem from './TodoItem'
import TodoQuickAdd from './TodoQuickAdd'

export default async function TodoWidget() {
  const supabase = await createServerSupabaseClient()

  const { data: todos } = await supabase
    .from('todos')
    .select('id, title, completed, due_date, linked_job_id, linked_client_id, jobs:linked_job_id(id, name), clients:linked_client_id(id, name)')
    .eq('completed', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(10)

  const now = new Date()

  const sorted = (todos ?? []).sort((a, b) => {
    const aOverdue = a.due_date && new Date(a.due_date) < now ? 0 : 1
    const bOverdue = b.due_date && new Date(b.due_date) < now ? 0 : 1
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="stat-icon-bubble bubble-sm">
            <CheckSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>To Do</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sorted.length} open task{sorted.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <Link href="/dashboard/todos" className="btn-ghost btn-ghost-accent">
          View all <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <TodoQuickAdd />

      {sorted.length > 0 && (
        <div className="space-y-1 mt-3 pt-3" style={{ borderTop: '1px solid var(--bg-border)' }}>
          {sorted.map((t) => {
            const job = t.jobs as unknown as { id: string; name: string } | null
            const client = t.clients as unknown as { id: string; name: string } | null
            const isOverdue = !!t.due_date && new Date(t.due_date) < now
            return (
              <TodoItem
                key={t.id}
                id={t.id}
                title={t.title}
                dueDate={t.due_date}
                isOverdue={isOverdue}
                linkedJob={job}
                linkedClient={client}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
