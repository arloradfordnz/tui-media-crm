import { createServerSupabaseClient } from '@/lib/supabase'
import { formatDate, getInitials, statusLabel } from '@/lib/format'
import { FileText } from 'lucide-react'
import Link from 'next/link'
import SearchInput from '@/components/SearchInput'

// Every document, newest first, as a list. The generator that used to fill
// this page is gone: contracts are drafted by Tui (create_contract), each one
// written for its project, so the page is only for finding and opening what
// exists. Opening a row goes to /dashboard/documents/[id], which still edits,
// downloads and emails it.
//
// ?clientId= (from a client's Documents tab) narrows the list to that client.
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ clientId?: string; search?: string }> }) {
  const params = await searchParams
  const search = params.search || ''
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('documents')
    .select('id, name, doc_type, content, created_at, client_id, clients(id, name)')
    .order('created_at', { ascending: false })
  if (params.clientId) query = query.eq('client_id', params.clientId)
  if (search) query = query.ilike('name', `%${search}%`)
  const { data: docs } = await query

  const rows = (docs ?? []).map((d) => {
    let signed = false
    let isStructured = false
    try {
      const form = JSON.parse(d.content as string)?.form
      isStructured = Boolean(form)
      signed = Boolean(form?.clientSignature)
    } catch { /* free text */ }
    const client = d.clients as unknown as { id: string; name: string } | null
    return { ...d, client, signed, isStructured }
  })
  const clientName = params.clientId ? rows[0]?.client?.name : null

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">
            {clientName ? `Everything for ${clientName}.` : 'Every contract and document. Ask Tui to draft a new one.'}
          </p>
        </div>
        <div className="page-header-actions">
          {params.clientId && (
            <Link href="/dashboard/documents" className="btn-secondary">All documents</Link>
          )}
          <SearchInput basePath="/dashboard/documents" placeholder="Search documents..." />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state card">
          <FileText className="w-10 h-10 empty-icon" />
          <p className="empty-title">No documents found</p>
          <p className="empty-description">
            {search ? 'Try a different search.' : 'Ask Tui to draft a contract and it will appear here.'}
          </p>
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full record-table">
            <thead>
              <tr>
                <th className="table-header text-left">Client &amp; Document</th>
                <th className="table-header text-left">Type</th>
                <th className="table-header text-left">Created</th>
                <th className="table-header text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="table-row">
                  <td className="px-4 py-4" data-role="primary">
                    <div className="job-identity">
                      <span className="avatar avatar-sm shrink-0" aria-hidden="true">
                        {d.client ? getInitials(d.client.name) : <FileText className="w-3.5 h-3.5" />}
                      </span>
                      <Link href={`/dashboard/documents/${d.id}`} className="job-identity-text">
                        <span className="job-identity-client">{d.client?.name ?? 'No client'}</span>
                        <span className="job-identity-job">{d.name}</span>
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-4" data-role="secondary">
                    {d.doc_type && <span className="badge badge-muted">{statusLabel(d.doc_type)}</span>}
                  </td>
                  <td className="px-4 py-4 text-sm" data-role="secondary" style={{ color: 'var(--text-secondary)' }}>
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-4 py-4 text-right text-sm" data-role="trailing">
                    {d.doc_type === 'contract' && d.isStructured ? (
                      d.signed
                        ? <span className="badge badge-success">Signed</span>
                        : <span className="badge badge-muted">Awaiting signature</span>
                    ) : <span className="cell-empty">—</span>}
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
