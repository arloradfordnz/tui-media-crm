import { createServerSupabaseClient } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { CheckSquare } from 'lucide-react'
import Link from 'next/link'
import TodoCheckbox from './TodoCheckbox'

export default async function TodoWidget() {
  const supabase = await createServerSupabaseClient()

  const { data: tasks } = await supabase
    .from('job_tasks')
    .select('id, title, completed, due_date, job_id, jobs(id, name, status)')
    .eq('completed', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(10)

  const activeTasks = (tasks ?? []).filter((t) => {
    const job = t.jobs as unknown as { id: string; name: string; status: string } | null
    return job && !['delivered', 'archived'].includes(job.status)
  })

  const now = new Date()

  const sorted = activeTasks.sort((a, b) => {
    const aOverdue = a.due_date && new Date(a.due_date) < now ? 0 : 1
    const bOverdue = b.due_date && new Date(b.due_date) < now ? 0 : 1
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    if (a.due_date) return -1
    if (b.due_date) return 1
    const aJob = (a.jobs as unknown as { name: string })?.name || ''
    const bJob = (b.jobs as unknown as { name: string })?.name || ''
    return aJob.localeCompare(bJob)
  })

  if (sorted.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>To Do</h2>
        </div>
        <Link href="/dashboard/jobs" className="text-xs" style={{ color: 'var(--accent)' }}>View all tasks &rarr;</Link>
      </div>
      <div className="space-y-1">
        {sorted.map((t) => {
          const job = t.jobs as unknown as { id: string; name: string } | null
          const isOverdue = t.due_date && new Date(t.due_date) < now
          return (
            <div key={t.id} className="flex items-start gap-3 py-2 rounded-lg px-2 -mx-2" style={{ background: 'transparent' }}>
              <TodoCheckbox taskId={t.id} />
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {job && (
                    <Link href={`/dashboard/jobs/${job.id}`} className="text-xs" style={{ color: 'var(--accent)' }}>{job.name}</Link>
                  )}
                  {t.due_date && (
                    <span className="text-xs" style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                      {isOverdue ? 'Overdue · ' : ''}{formatDate(t.due_date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
