import { createServerSupabaseClient } from '@/lib/supabase'
import { getContentBacklog, type MonthStatus } from '@/lib/content-backlog'
import { getInitials } from '@/lib/format'
import { Repeat2, Plus } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Retainers' }

// "How many videos do I owe Bainbridge for August" used to take seven steps
// and manual counting. getContentBacklog() has answered it all along — it was
// imported by three files, all assistant plumbing, and rendered by zero pages.
//
// Counted from actual uploads to the client portal, not job status: statuses
// go stale and deliverables.completed is false on every row in practice,
// including months that shipped in full. A month with no job at all is the
// worst case rather than an absent one, so it shows red rather than scoring 0.

const CHIP_MONTHS = 4

function chipClass(m: MonthStatus): string {
  if (m.isCurrentMonth) return 'retainer-chip retainer-chip-current'
  if (!m.jobExists) return 'retainer-chip retainer-chip-never'
  if (m.missing > 0) return 'retainer-chip retainer-chip-behind'
  return 'retainer-chip retainer-chip-done'
}

export default async function RetainersPage() {
  const supabase = await createServerSupabaseClient()
  const backlog = await getContentBacklog(supabase, new Date())

  const { totals, clients } = backlog

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Retainers</h1>
          {/* The headline number, stated once, in the same terms Tui uses. */}
          <p className="page-subtitle">
            {totals.videos_owed === 0
              ? 'Nothing owed — every past month is delivered.'
              : `${totals.videos_owed} video${totals.videos_owed === 1 ? '' : 's'} owed across ${totals.clients_behind} client${totals.clients_behind === 1 ? '' : 's'}.`}
            {totals.months_never_started > 0 &&
              ` ${totals.months_never_started} month${totals.months_never_started === 1 ? ' was' : 's were'} never set up.`}
          </p>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="empty-state card">
          <Repeat2 className="w-10 h-10 empty-icon" />
          <p className="empty-title">No retainer cadence to measure</p>
          <p className="empty-description">
            Retainer clients with month-named jobs (&ldquo;July Content&rdquo;) appear here.
          </p>
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full record-table">
            <thead>
              <tr>
                <th className="table-header text-left">Client</th>
                <th className="table-header text-left">Recent months</th>
                <th className="table-header text-right">Owed</th>
                <th className="table-header text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const recent = c.months.slice(-CHIP_MONTHS)
                const current = c.currentMonth
                return (
                  <tr key={c.clientId} className="table-row">
                    <td className="px-4 py-4" data-role="primary">
                      <Link href={`/dashboard/clients/${c.clientId}`} className="flex items-center gap-3">
                        <div className="avatar avatar-md">{getInitials(c.clientName)}</div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {c.clientName}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            ~{c.typicalVideosPerMonth}/month
                          </p>
                        </div>
                      </Link>
                    </td>

                    <td className="px-4 py-4" data-role="secondary">
                      <div className="retainer-chips">
                        {recent.map((m) => (
                          <span
                            key={m.month}
                            className={chipClass(m)}
                            title={`${m.label} — ${m.uploaded}/${m.expected} uploaded${m.jobExists ? '' : ', job never created'}`}
                          >
                            {m.label.slice(0, 3)} {m.uploaded}/{m.expected}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-sm text-right" data-role="secondary">
                      {c.videosOwed > 0 ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                          {c.videosOwed} owed
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>up to date</span>
                      )}
                    </td>

                    {/* Exactly one action: open this month's job, or create it. */}
                    <td className="px-4 py-4 text-right" data-role="trailing">
                      {current?.jobId ? (
                        <Link href={`/dashboard/jobs/${current.jobId}`} className="btn-ghost">
                          Open {current.label.slice(0, 3)}
                        </Link>
                      ) : (
                        <Link href="/dashboard/jobs/new" className="btn-ghost btn-ghost-accent">
                          <Plus className="w-3.5 h-3.5" /> Create {current?.label.slice(0, 3) ?? 'month'}
                        </Link>
                      )}
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
