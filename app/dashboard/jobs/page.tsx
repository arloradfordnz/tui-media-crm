import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, formatDate, getInitials, statusLabel, stripJobPrefix } from '@/lib/format'

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
  { value: 'active', label: 'Active' },
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'booked', label: 'Booked' },
  { value: 'editing', label: 'Editing' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'archived', label: 'Archived' },
]

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const params = await searchParams
  const statusFilter = params.status || 'active'
  const search = params.search || ''

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('jobs')
    .select('id, name, job_type, status, shoot_date, quote_value, client_id, clients(id, name)')
    .order('shoot_date', { ascending: false })

  if (statusFilter === 'archived') query = query.eq('status', 'archived')
  else if (statusFilter === 'active') query = query.neq('status', 'archived')
  else query = query.eq('status', statusFilter)
  if (search) query = query.ilike('name', `%${search}%`)

  // Fetch jobs and time totals in parallel — filtering time entries to the
  // visible jobs happens in JS, which saves a dependent second round trip.
  const [{ data: jobs }, { data: timeTotals }] = await Promise.all([
    query,
    supabase
      .from('time_entries')
      .select('job_id, duration_seconds')
      .not('ended_at', 'is', null),
  ])

  const jobIds = new Set((jobs ?? []).map((j) => j.id))
  const timeByJob: Record<string, number> = {}
  for (const t of timeTotals ?? []) {
    if (!jobIds.has(t.job_id)) continue
    timeByJob[t.job_id] = (timeByJob[t.job_id] || 0) + (t.duration_seconds || 0)
  }

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Jobs</h1>
        </div>
        <div className="page-header-actions">
          <SearchInput basePath="/dashboard/jobs" placeholder="Search jobs..." />
          <Link href="/dashboard/jobs/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Job
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <FilterTabs options={JOB_STATUS_OPTIONS} paramName="status" defaultValue="active" />
      </div>

      {/* Table */}
      {(jobs ?? []).length === 0 ? (
        <div className="empty-state card">
          <Briefcase className="w-10 h-10 empty-icon" />
          <p className="empty-title">No jobs found</p>
          <p className="empty-description">
            {search || statusFilter !== 'active' ? 'Try adjusting your filters.' : 'Create your first job to get started.'}
          </p>
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full record-table">
            <thead>
              <tr>
                <th className="table-header text-left">Job</th>
                <th className="table-header text-left">Client</th>
                <th className="table-header text-left">Shoot Date</th>
                <th className="table-header text-left">Type</th>
                <th className="table-header text-right">Value</th>
                <th className="table-header text-right">Time</th>
                <th className="table-header text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => {
                const client = j.clients as unknown as { id: string; name: string }
                return (
                  <tr key={j.id} className="table-row">
                    <td className="px-4 py-4" data-role="primary">
                      <Link href={`/dashboard/jobs/${j.id}`} className="block">
                        <span className="text-sm font-medium block" style={{ color: 'var(--text-primary)' }}>
                          {stripJobPrefix(j.name)}
                        </span>
                        {/* Retainer jobs are named by month ("July Content"), so
                            the same name appears for every client with that
                            cadence. The Client column already disambiguates,
                            but scanning down the Job column alone was still
                            confusing — this subtitle means the Job cell reads
                            unambiguously on its own. */}
                        <span className="text-xs cell-dupe" style={{ color: 'var(--text-tertiary)' }}>
                          {client.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-4" data-role="secondary">
                      <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-2">
                        <div className="avatar avatar-sm">{getInitials(client.name)}</div>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{client.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm" data-role="secondary" style={{ color: 'var(--text-secondary)' }}>{j.shoot_date ? formatDate(j.shoot_date) : <span className="cell-empty">—</span>}</td>
                    <td className="px-4 py-4" data-role="secondary">
                      {j.job_type && <span className="badge badge-muted">{statusLabel(j.job_type)}</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-right" data-role="secondary" style={{ color: 'var(--text-primary)' }}>{j.quote_value ? formatNZD(j.quote_value) : <span className="cell-empty">—</span>}</td>
                    <td className="px-4 py-4 text-sm text-right" data-role="secondary" style={{ color: 'var(--text-tertiary)' }}>
                      {timeByJob[j.id] ? formatHours(timeByJob[j.id]) : <span className="cell-empty">—</span>}
                    </td>
                    <td className="px-4 py-4 text-right" data-role="trailing">
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
