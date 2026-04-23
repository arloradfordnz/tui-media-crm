import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, formatDate, getInitials, statusLabel } from '@/lib/format'

function formatHours(seconds: number): string {
  const h = seconds / 3600
  return h < 1 ? `${Math.round(seconds / 60)}m` : `${h % 1 === 0 ? h : h.toFixed(1)}h`
}
import { Briefcase, Plus } from 'lucide-react'
import Link from 'next/link'
import SearchInput from '@/components/SearchInput'
import FilterTabs from '@/components/FilterTabs'
import QuickStatus from './QuickStatus'

const JOB_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'booked', label: 'Booked' },
  { value: 'preproduction', label: 'Pre-production' },
  { value: 'shootday', label: 'Shoot Day' },
  { value: 'editing', label: 'Editing' },
]

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const params = await searchParams
  const statusFilter = params.status || 'all'
  const search = params.search || ''

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('jobs')
    .select('id, name, job_type, status, shoot_date, quote_value, client_id, clients(id, name)')
    .order('shoot_date', { ascending: false })

  if (statusFilter !== 'all') query = query.eq('status', statusFilter)
  if (search) query = query.ilike('name', `%${search}%`)

  const { data: jobs } = await query

  // Time totals per job — gracefully skip if table doesn't exist yet
  const jobIds = (jobs ?? []).map((j) => j.id)
  let timeByJob: Record<string, number> = {}
  if (jobIds.length > 0) {
    const { data: timeTotals } = await supabase
      .from('time_entries')
      .select('job_id, duration_seconds')
      .in('job_id', jobIds)
      .not('ended_at', 'is', null)
    if (timeTotals) {
      for (const t of timeTotals) {
        timeByJob[t.job_id] = (timeByJob[t.job_id] || 0) + (t.duration_seconds || 0)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Jobs</h1>
        <Link href="/dashboard/jobs/new" className="btn-primary w-fit">
          <Plus className="w-4 h-4" /> New Job
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput basePath="/dashboard/jobs" placeholder="Search jobs..." />
        <FilterTabs options={JOB_STATUS_OPTIONS} paramName="status" defaultValue="all" />
      </div>

      {/* Table */}
      {(jobs ?? []).length === 0 ? (
        <div className="empty-state card">
          <Briefcase className="w-10 h-10 empty-icon" />
          <p className="empty-title">No jobs found</p>
          <p className="empty-description">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first job to get started.'}
          </p>
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header text-left">Job</th>
                <th className="table-header text-left hidden md:table-cell">Client</th>
                <th className="table-header text-left hidden lg:table-cell">Shoot Date</th>
                <th className="table-header text-left hidden sm:table-cell">Type</th>
                <th className="table-header text-right hidden sm:table-cell">Value</th>
                <th className="table-header text-right hidden md:table-cell">Time</th>
                <th className="table-header text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => {
                const client = j.clients as unknown as { id: string; name: string }
                return (
                  <tr key={j.id} className="table-row">
                    <td className="px-4 py-4">
                      <Link href={`/dashboard/jobs/${j.id}`} className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {j.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-2">
                        <div className="avatar avatar-sm">{getInitials(client.name)}</div>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{client.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(j.shoot_date)}</td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      {j.job_type && <span className="badge badge-muted">{statusLabel(j.job_type)}</span>}
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-primary)' }}>{j.quote_value ? formatNZD(j.quote_value) : '—'}</td>
                    <td className="px-4 py-4 hidden md:table-cell text-sm text-right" style={{ color: 'var(--text-tertiary)' }}>
                      {timeByJob[j.id] ? formatHours(timeByJob[j.id]) : '—'}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <QuickStatus jobId={j.id} status={j.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
