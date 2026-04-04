import { db } from '@/lib/db'
import { formatNZD, formatDate, getInitials, statusLabel, statusBadgeClass } from '@/lib/format'
import { Briefcase, Plus, Search } from 'lucide-react'
import Link from 'next/link'

const JOB_STATUSES = ['all', 'enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'delivered', 'archived']

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const params = await searchParams
  const statusFilter = params.status || 'all'
  const search = params.search || ''

  const where: Record<string, unknown> = {}
  if (statusFilter !== 'all') where.status = statusFilter
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { client: { name: { contains: search } } },
    ]
  }

  const jobs = await db.job.findMany({
    where,
    orderBy: [{ shootDate: 'desc' }, { createdAt: 'desc' }],
    include: { client: { select: { id: true, name: true } } },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Jobs</h1>
        <Link href="/dashboard/jobs/new" className="btn-primary">
          <Plus className="w-4 h-4" /> New Job
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="relative flex-1" action="/dashboard/jobs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input name="search" defaultValue={search} placeholder="Search jobs..." className="search-input" />
          {statusFilter !== 'all' && <input type="hidden" name="status" value={statusFilter} />}
        </form>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {JOB_STATUSES.slice(0, 6).map((s) => (
            <Link
              key={s}
              href={`/dashboard/jobs?status=${s}${search ? `&search=${search}` : ''}`}
              className="btn-secondary text-sm whitespace-nowrap"
              style={statusFilter === s ? { background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
            >
              {s === 'all' ? 'All' : statusLabel(s)}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {jobs.length === 0 ? (
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
              {jobs.map((j) => (
                <tr key={j.id} className="table-row">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/jobs/${j.id}`} className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {j.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Link href={`/dashboard/clients/${j.client.id}`} className="flex items-center gap-2">
                      <div className="avatar avatar-sm">{getInitials(j.client.name)}</div>
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{j.client.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(j.shootDate)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {j.jobType && <span className="badge badge-muted">{statusLabel(j.jobType)}</span>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-primary)' }}>{j.quoteValue ? formatNZD(j.quoteValue) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`badge ${statusBadgeClass(j.status)}`}>{statusLabel(j.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
