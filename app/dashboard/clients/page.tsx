import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, formatDate, getInitials, statusLabel, statusBadgeClass } from '@/lib/format'
import { Users, Plus, Search } from 'lucide-react'
import Link from 'next/link'

const STATUSES = ['all', 'lead', 'active', 'past', 'archived']

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string }> }) {
  const params = await searchParams
  const search = params.search || ''
  const statusFilter = params.status || 'all'

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('clients')
    .select('id, name, email, location, status, lifetime_value, tags, created_at')
    .order('name', { ascending: true })

  if (statusFilter !== 'all') query = query.eq('status', statusFilter)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,location.ilike.%${search}%`)

  const { data: clientRows } = await query

  // Fetch job counts
  const { data: jobCounts } = await supabase
    .from('jobs')
    .select('client_id')

  const countMap: Record<string, number> = {}
  for (const j of jobCounts ?? []) {
    countMap[j.client_id] = (countMap[j.client_id] || 0) + 1
  }

  const clients = (clientRows ?? []).map((c) => ({ ...c, jobCount: countMap[c.id] || 0 }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Clients</h1>
        <Link href="/dashboard/clients/new" className="btn-primary">
          <Plus className="w-4 h-4" /> New Client
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="relative flex-1" action="/dashboard/clients" method="GET">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search clients..."
            className="search-input"
          />
          {statusFilter !== 'all' && <input type="hidden" name="status" value={statusFilter} />}
        </form>
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/dashboard/clients?status=${s}${search ? `&search=${search}` : ''}`}
              className="btn-secondary text-sm"
              style={statusFilter === s ? { background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
            >
              {s === 'all' ? 'All' : statusLabel(s)}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {clients.length === 0 ? (
        <div className="empty-state card">
          <Users className="w-10 h-10 empty-icon" />
          <p className="empty-title">No clients found</p>
          <p className="empty-description">
            {search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first client to get started.'}
          </p>
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header text-left">Client</th>
                <th className="table-header text-left hidden md:table-cell">Email</th>
                <th className="table-header text-left hidden lg:table-cell">Location</th>
                <th className="table-header text-right hidden sm:table-cell">Jobs</th>
                <th className="table-header text-right hidden sm:table-cell">Value</th>
                <th className="table-header text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const tags: string[] = c.tags ? JSON.parse(c.tags) : []
                return (
                  <tr key={c.id} className="table-row">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-3">
                        <div className="avatar avatar-md">{getInitials(c.name)}</div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                          {tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {tags.slice(0, 3).map((t) => (
                                <span key={t} className="badge badge-muted" style={{ fontSize: '10px', padding: '1px 6px' }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{c.email || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{c.location || '—'}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-secondary)' }}>{c.jobCount}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-primary)' }}>{formatNZD(c.lifetime_value)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`badge ${statusBadgeClass(c.status)}`}>{statusLabel(c.status)}</span>
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
