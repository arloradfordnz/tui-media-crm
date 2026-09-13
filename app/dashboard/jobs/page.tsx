import { Suspense } from 'react'
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

  // The tracked-time totals are a whole-table scan of time_entries, and they
  // are the LEAST important column on the page. Awaiting them held the entire
  // list back — which is what made a freshly created job take a beat to
  // appear, since a server action's redirect doesn't get to show the route's
  // loading skeleton: the browser sits on the action until the destination has
  // finished rendering.
  //
  // So this is started but not awaited. The list renders as soon as the jobs
  // query lands and each Time cell streams in behind it. One promise, shared
  // by every row — not one query per row.
  const timePromise: Promise<Record<string, number>> = Promise.resolve(supabase
    .from('time_entries')
    .select('job_id, duration_seconds')
    .not('ended_at', 'is', null)
    .then(({ data }) => {
      const totals: Record<string, number> = {}
      for (const t of data ?? []) {
        totals[t.job_id] = (totals[t.job_id] || 0) + (t.duration_seconds || 0)
      }
      return totals
    }))

  const { data: jobs } = await query

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
                <th className="table-header text-left">Client &amp; Job</th>
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
                    {/* Client first, job second, and only one of each in the
                        row. It used to lead with the job name and repeat the
                        client twice — once as a subtitle, once in its own
                        column — which is the worst possible arrangement for a
                        book of work where the job names repeat: retainer jobs
                        are named by month ("July Content"), so the column you
                        read first was the column that told you least, and the
                        thing that actually distinguished the row was printed
                        twice further right.

                        Leading with the client puts a proper noun and a
                        recognisable avatar at the start of every row, so the
                        eye can find "Bainbridge" down the left edge by shape
                        before it reads a word. The job name sits under it as
                        the detail it is. */}
                    <td className="px-4 py-4" data-role="primary">
                      <div className="job-identity">
                        <Link
                          href={`/dashboard/clients/${client.id}`}
                          className="avatar avatar-sm shrink-0"
                          aria-label={`Open ${client.name}`}
                        >
                          {getInitials(client.name)}
                        </Link>
                        <Link href={`/dashboard/jobs/${j.id}`} className="job-identity-text">
                          <span className="job-identity-client">{client.name}</span>
                          <span className="job-identity-job">{stripJobPrefix(j.name)}</span>
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm" data-role="secondary" style={{ color: 'var(--text-secondary)' }}>{j.shoot_date ? formatDate(j.shoot_date) : <span className="cell-empty">—</span>}</td>
                    <td className="px-4 py-4" data-role="secondary">
                      {j.job_type && <span className="badge badge-muted">{statusLabel(j.job_type)}</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-right" data-role="secondary" style={{ color: 'var(--text-primary)' }}>{j.quote_value ? formatNZD(j.quote_value) : <span className="cell-empty">—</span>}</td>
                    <td className="px-4 py-4 text-sm text-right" data-role="secondary" style={{ color: 'var(--text-tertiary)' }}>
                      <Suspense fallback={<span className="cell-empty">—</span>}>
                        <JobTime totals={timePromise} jobId={j.id} />
                      </Suspense>
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

// Awaits the shared totals promise. Every row renders one of these, but they
// all await the same in-flight query, so this costs one round trip for the
// page rather than one per job.
async function JobTime({ totals, jobId }: { totals: Promise<Record<string, number>>; jobId: string }) {
  const seconds = (await totals)[jobId]
  return seconds ? <>{formatHours(seconds)}</> : <span className="cell-empty">—</span>
}
