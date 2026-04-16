import { createServerSupabaseClient } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'
import { Mail } from 'lucide-react'
import Link from 'next/link'
import SearchInput from '@/components/SearchInput'
import EmailTypeFilter from './EmailTypeFilter'

const TYPE_BADGE: Record<string, string> = {
  welcome: 'badge-accent',
  proposal: 'badge-warning',
  proposal_accepted: 'badge-success',
  delivery: 'badge-accent',
  revision: 'badge-warning',
  approval: 'badge-success',
}

const TYPE_LABEL: Record<string, string> = {
  welcome: 'Welcome',
  proposal: 'Proposal',
  proposal_accepted: 'Accepted',
  delivery: 'Delivery',
  revision: 'Revision',
  approval: 'Approval',
}

type EmailLog = {
  id: string
  to_address: string
  subject: string
  type: string
  status: string
  error: string | null
  client_id: string | null
  job_id: string | null
  created_at: string
  clients: { id: string; name: string } | null
  jobs: { id: string; name: string } | null
}

export default async function EmailLogPage({ searchParams }: { searchParams: Promise<{ type?: string; search?: string }> }) {
  const params = await searchParams
  const typeFilter = params.type || 'all'
  const search = params.search || ''

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('email_logs')
    .select('id, to_address, subject, type, status, error, client_id, job_id, created_at, clients(id, name), jobs(id, name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (typeFilter !== 'all') query = query.eq('type', typeFilter)
  if (search) query = query.or(`to_address.ilike.%${search}%,subject.ilike.%${search}%`)

  const { data } = await query
  const logs = (data ?? []) as unknown as EmailLog[]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Email Log</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput basePath="/dashboard/emails" placeholder="Search by recipient or subject..." />
        <EmailTypeFilter />
      </div>

      {/* Table */}
      {logs.length === 0 ? (
        <div className="empty-state card">
          <Mail className="w-10 h-10 empty-icon" />
          <p className="empty-title">No emails found</p>
          <p className="empty-description">
            {search || typeFilter !== 'all' ? 'Try adjusting your filters.' : 'Email logs will appear here as emails are sent.'}
          </p>
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">To</th>
                <th className="table-header text-left hidden md:table-cell">Subject</th>
                <th className="table-header text-left hidden sm:table-cell">Type</th>
                <th className="table-header text-left hidden lg:table-cell">Client</th>
                <th className="table-header text-left hidden lg:table-cell">Job</th>
                <th className="table-header text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="table-row">
                  <td className="px-4 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {formatDateTime(log.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {log.to_address}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {log.subject}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`badge ${TYPE_BADGE[log.type] || 'badge-muted'}`}>
                      {TYPE_LABEL[log.type] || log.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {log.clients ? (
                      <Link href={`/dashboard/clients/${log.clients.id}`} className="text-sm" style={{ color: 'var(--accent)' }}>
                        {log.clients.name}
                      </Link>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {log.jobs ? (
                      <Link href={`/dashboard/jobs/${log.jobs.id}`} className="text-sm" style={{ color: 'var(--accent)' }}>
                        {log.jobs.name}
                      </Link>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`badge ${log.status === 'sent' ? 'badge-success' : 'badge-danger'}`}>
                      {log.status === 'sent' ? 'Sent' : 'Failed'}
                    </span>
                    {log.error && (
                      <p className="text-xs mt-1" style={{ color: 'var(--danger)' }} title={log.error}>
                        {log.error.length > 40 ? log.error.slice(0, 40) + '...' : log.error}
                      </p>
                    )}
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
