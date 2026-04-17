import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, formatDate, getInitials, statusLabel, statusBadgeClass } from '@/lib/format'
import { Briefcase, Plus } from 'lucide-react'
import Link from 'next/link'
import SearchInput from '@/components/SearchInput'
import FilterTabs from '@/components/FilterTabs'

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
                <th className="table-header text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => {
                const client = j.clients as unknown as { id: string; name: string }
                return (
                  <tr key={j.id} className="table-row">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/jobs/${j.id}`} className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {j.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-2">
                        <div className="avatar avatar-sm">{getInitials(client.name)}</div>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{client.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(j.shoot_date)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {j.job_type && <span className="badge badge-muted">{statusLabel(j.job_type)}</span>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-primary)' }}>{j.quote_value ? formatNZD(j.quote_value) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`badge ${statusBadgeClass(j.status)}`}>{statusLabel(j.status)}</span>
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
