import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, getInitials } from '@/lib/format'
import { Users, Plus } from 'lucide-react'
import Link from 'next/link'
import SearchInput from '@/components/SearchInput'
import FilterTabs from '@/components/FilterTabs'
import QuickStatus from './QuickStatus'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'past', label: 'Past' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string }> }) {
  const params = await searchParams
  const search = params.search || ''
  const statusFilter = params.status || 'active'

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('clients')
    .select('id, name, email, location, status, lifetime_value, tags, created_at, jobs(quote_value)')
    .order('name', { ascending: true })

  if (statusFilter !== 'all') query = query.eq('status', statusFilter)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,location.ilike.%${search}%`)

  const { data: clientRows } = await query

  const clients = (clientRows ?? []).map((c) => {
    const jobs = (c.jobs as unknown as { quote_value: number | null }[]) ?? []
    const jobsValue = jobs.reduce((sum, j) => sum + (j.quote_value ?? 0), 0)
    return {
      ...c,
      jobCount: jobs.length,
      lifetime_value: jobsValue,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Clients</h1>
        <Link href="/dashboard/clients/new" className="btn-primary w-fit">
          <Plus className="w-4 h-4" /> New Client
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput basePath="/dashboard/clients" placeholder="Search clients..." />
        <FilterTabs options={STATUS_OPTIONS} paramName="status" defaultValue="active" />
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
                    <td className="px-4 py-4">
                      <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-3">
                        <div className="avatar avatar-md">{getInitials(c.name)}</div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                          {tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {tags.slice(0, 3).map((t) => (
                                <span key={t} className="badge badge-muted badge-sm">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{c.email || '—'}</td>
                    <td className="px-4 py-4 hidden lg:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{c.location || '—'}</td>
                    <td className="px-4 py-4 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-secondary)' }}>{c.jobCount}</td>
                    <td className="px-4 py-4 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-primary)' }}>{formatNZD(c.lifetime_value)}</td>
                    <td className="px-4 py-4 text-right">
                      <QuickStatus clientId={c.id} status={c.status} />
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
