import { createServerSupabaseClient } from '@/lib/supabase'
import { timeAgo, statusLabel } from '@/lib/format'
import { Activity, Briefcase, Users } from 'lucide-react'
import Link from 'next/link'
import FilterTabs from '@/components/FilterTabs'

const ACTION_LABELS: Record<string, string> = {
  job_created: 'Job created',
  status_changed: 'Status changed',
  proposal_sent: 'Proposal sent',
  proposal_accepted: 'Proposal accepted',
  proposal_declined: 'Proposal declined',
  revision_requested: 'Revision requested',
  file_approved: 'File approved',
  client_created: 'Client created',
}

const ACTION_COLORS: Record<string, string> = {
  job_created: 'var(--accent)',
  status_changed: 'var(--warning)',
  proposal_sent: 'var(--accent)',
  proposal_accepted: 'var(--success)',
  proposal_declined: 'var(--danger)',
  revision_requested: 'var(--warning)',
  file_approved: 'var(--success)',
  client_created: 'var(--accent)',
}

const PAGE_SIZE = 30

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const { page: pageStr, type } = await searchParams
  const page = Math.max(1, parseInt(pageStr || '1'))
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('activities')
    .select('id, action, details, created_at, job_id, client_id, jobs(id, name), clients(id, name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (type && type !== 'all') {
    query = query.eq('action', type)
  }

  const { data: activities, count } = await query

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  // Get distinct action types for filter
  const { data: actionTypes } = await supabase
    .from('activities')
    .select('action')
    .order('action')

  const uniqueTypes = [...new Set((actionTypes ?? []).map((a) => a.action))]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Activity</h1>
        {count != null && (
          <span className="badge badge-muted">{count} events</span>
        )}
      </div>

      {/* Type filter */}
      <FilterTabs
        paramName="type"
        defaultValue="all"
        options={[
          { value: 'all', label: 'All' },
          ...uniqueTypes.map((t) => ({ value: t, label: ACTION_LABELS[t] || statusLabel(t) })),
        ]}
      />

      {(activities ?? []).length === 0 ? (
        <div className="card text-center py-16">
          <Activity className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No activity recorded yet.</p>
        </div>
      ) : (
        <div className="card-flush">
          {(activities ?? []).map((a, i) => {
            const job = a.jobs as unknown as { id: string; name: string } | null
            const client = a.clients as unknown as { id: string; name: string } | null
            const dotColor = ACTION_COLORS[a.action] || 'var(--text-tertiary)'
            return (
              <div
                key={a.id}
                className="flex items-start gap-4 px-5 py-4"
                style={{ borderBottom: i < (activities ?? []).length - 1 ? '1px solid var(--bg-border)' : 'none' }}
              >
                <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {a.details || ACTION_LABELS[a.action] || statusLabel(a.action)}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {job && (
                      <Link href={`/dashboard/jobs/${job.id}`} className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                        <Briefcase className="w-3 h-3" />
                        {job.name}
                      </Link>
                    )}
                    {client && (
                      <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Users className="w-3 h-3" />
                        {client.name}
                      </Link>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(a.created_at)}</span>
                  </div>
                </div>
                <span className="badge badge-muted text-xs shrink-0 hidden sm:inline-flex">
                  {ACTION_LABELS[a.action] || statusLabel(a.action)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/dashboard/activity?page=${page - 1}${type ? `&type=${type}` : ''}`} className="btn-secondary text-sm">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/dashboard/activity?page=${page + 1}${type ? `&type=${type}` : ''}`} className="btn-secondary text-sm">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
