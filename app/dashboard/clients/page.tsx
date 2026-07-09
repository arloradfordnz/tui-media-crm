import { createServerSupabaseClient } from '@/lib/supabase'
import { formatNZD, getInitials, statusLabel, statusBadgeClass } from '@/lib/format'
import { Users, Plus } from 'lucide-react'
import Link from 'next/link'
import SearchInput from '@/components/SearchInput'
import FilterTabs from '@/components/FilterTabs'
import QuickStatus from './QuickStatus'
import QuickCategory from './QuickCategory'
import SyncLifetimeButton from './SyncLifetimeButton'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'past', label: 'Past' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'one_off', label: 'One-off' },
]

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; category?: string }> }) {
  const params = await searchParams
  const search = params.search || ''
  const statusFilter = params.status || 'active'
  const categoryFilter = params.category || 'all'

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('clients')
    .select('id, name, email, location, status, client_category, lifetime_value, tags, created_at, jobs(quote_value)')
    .order('name', { ascending: true })

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }
  if (categoryFilter !== 'all') {
    query = query.eq('client_category', categoryFilter)
  }
  if (search) {
    // Strip PostgREST filter metacharacters — commas, parens and asterisks
    // would otherwise break the .or() expression (or worse, alter the filter).
    const safe = search.replace(/[(),*]/g, ' ').trim()
    if (safe) query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,location.ilike.%${safe}%`)
  }

  const { data: clientRows } = await query

  const clients = (clientRows ?? []).map((c) => {
    const jobs = (c.jobs as unknown as { quote_value: number | null }[]) ?? []
    return {
      ...c,
      client_category: (c as { client_category?: string | null }).client_category ?? null,
      jobCount: jobs.length,
      // Paid revenue synced from Xero (Sync Value button / daily cron) — not quoted totals.
      lifetime_value: Number(c.lifetime_value ?? 0),
    }
  })

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Clients</h1>
        </div>
        <div className="page-header-actions">
          <SearchInput basePath="/dashboard/clients" placeholder="Search clients..." />
          <SyncLifetimeButton />
          <Link href="/dashboard/clients/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Client
          </Link>
        </div>
      </div>

      {/* Status + category tabs */}
      <div className="flex items-center justify-between mb-6">
        <FilterTabs options={STATUS_OPTIONS} paramName="status" defaultValue="active" />
        <div className="hidden sm:block">
          <FilterTabs options={CATEGORY_OPTIONS} paramName="category" defaultValue="all" />
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
                <th className="table-header text-left hidden sm:table-cell">Type</th>
                <th className="table-header text-right hidden sm:table-cell">Jobs</th>
                <th className="table-header text-right hidden sm:table-cell">Value</th>
                <th className="table-header text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                let tags: string[] = []
                try { if (c.tags) tags = JSON.parse(c.tags) } catch { tags = [] }
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
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <QuickCategory clientId={c.id} category={c.client_category} />
                    </td>
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
