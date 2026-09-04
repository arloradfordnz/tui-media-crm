import { createServerSupabaseClient } from '@/lib/supabase'
import { getInitials } from '@/lib/format'
import { Repeat2 } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Retainers' }

// Phase 1 interim. The bottom tab bar needs a real route to point at, and a
// filtered client list is an honest answer to "who's on retainer" — but it is
// NOT the Retainers surface from the plan. Phase 2 replaces the body of this
// file with getContentBacklog() (lib/content-backlog.ts), which already
// computes videos-owed per client and is currently rendered nowhere. The
// route and the tab stay put, so that swap touches this file only.
export default async function RetainersPage() {
  const supabase = await createServerSupabaseClient()

  const { data: rows } = await supabase
    .from('clients')
    .select('id, name, status, shoots_per_month, jobs(id)')
    .eq('client_category', 'retainer')
    .neq('status', 'archived')
    .order('name', { ascending: true })

  const clients = (rows ?? []).map((c) => ({
    ...c,
    jobCount: ((c.jobs as unknown as { id: string }[]) ?? []).length,
  }))

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Retainers</h1>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="empty-state card">
          <Repeat2 className="w-10 h-10 empty-icon" />
          <p className="empty-title">No retainer clients</p>
          <p className="empty-description">
            Clients with their type set to Retainer appear here.
          </p>
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full record-table">
            <thead>
              <tr>
                <th className="table-header text-left">Client</th>
                <th className="table-header text-right">Per month</th>
                <th className="table-header text-right">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="table-row">
                  <td className="px-4 py-4" data-role="primary">
                    <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-3">
                      <div className="avatar avatar-md">{getInitials(c.name)}</div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {c.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-sm text-right" data-role="secondary">
                    {c.shoots_per_month ? `${c.shoots_per_month}/mo` : '—'}
                  </td>
                  <td className="px-4 py-4 text-sm text-right" data-role="secondary">
                    {c.jobCount} {c.jobCount === 1 ? 'job' : 'jobs'}
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
