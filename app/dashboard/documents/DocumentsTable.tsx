import Link from 'next/link'
import { FileText } from 'lucide-react'
import { formatDate, getInitials, statusLabel } from '@/lib/format'

export type DocumentRow = {
  id: string
  href: string
  name: string
  doc_type: string | null
  created_at: string
  client: { id: string; name: string } | null
  signed: boolean
  isStructured: boolean
  proposalStatus: string | null
  viewedAt: string | null
  sentAt: string | null
}

// "Opened 2 days ago" for anything waiting on the client, so Arlo can tell an
// ignored contract from one they have read and not signed yet.
function openedLabel(iso: string | null): string {
  if (!iso) return 'Not opened yet'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days <= 0 ? 'Opened today' : days === 1 ? 'Opened yesterday' : `Opened ${days} days ago`
}

// Every document and proposal, one row each. On a phone the table reflows into
// cards (.record-table in globals.css): who it is for and what it is on the
// left, its state on the right, the type and date underneath.
export default function DocumentsTable({ rows }: { rows: DocumentRow[] }) {
  return (
    <div className="card-flush">
      <table className="w-full record-table docs-table">
        <thead>
          <tr>
            <th className="table-header text-left">Client &amp; Document</th>
            <th className="table-header text-left">Type</th>
            <th className="table-header text-left">Created</th>
            <th className="table-header text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const waiting = (d.proposalStatus === 'sent') || (d.doc_type === 'contract' && d.isStructured && !d.signed)
            const showOpened = waiting && (d.proposalStatus === 'sent' || !!d.sentAt || !!d.viewedAt)
            return (
              <tr key={d.id} className="table-row">
                <td className="px-4 py-4" data-role="primary">
                  <div className="job-identity">
                    <span className="avatar avatar-sm shrink-0" aria-hidden="true">
                      {d.client ? getInitials(d.client.name) : <FileText className="w-3.5 h-3.5" />}
                    </span>
                    <Link href={d.href} className="job-identity-text">
                      <span className="job-identity-client">{d.client?.name ?? 'No client'}</span>
                      <span className="job-identity-job">{d.name}</span>
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-4" data-role="secondary">
                  {d.doc_type && <span className="docs-type">{statusLabel(d.doc_type)}</span>}
                </td>
                <td className="px-4 py-4 text-sm" data-role="secondary" style={{ color: 'var(--text-secondary)' }}>
                  {formatDate(d.created_at)}
                </td>
                <td className="px-4 py-4 text-right text-sm" data-role="trailing">
                  <div className="docs-status">
                    {d.proposalStatus ? (
                      <span className={`badge ${d.proposalStatus === 'accepted' ? 'badge-success' : d.proposalStatus === 'declined' ? 'badge-danger' : 'badge-muted'}`}>
                        {d.proposalStatus === 'sent' ? 'Awaiting answer' : statusLabel(d.proposalStatus)}
                      </span>
                    ) : d.doc_type === 'contract' && d.isStructured ? (
                      d.signed
                        ? <span className="badge badge-success">Signed</span>
                        : <span className="badge badge-muted">Awaiting signature</span>
                    ) : <span className="cell-empty docs-no-status">—</span>}
                    {showOpened && <span className={`docs-opened${d.viewedAt ? ' is-opened' : ''}`}>{openedLabel(d.viewedAt)}</span>}
                  </div>
                </td>
                {/* On a phone "Opened..." joins the line under the name instead
                    of stacking under the badge; this cell is hidden on desktop. */}
                <td className="docs-opened-cell" data-role="secondary">
                  {showOpened ? <span className={d.viewedAt ? 'docs-opened is-opened' : 'docs-opened'}>{openedLabel(d.viewedAt)}</span> : <span className="cell-empty" />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
