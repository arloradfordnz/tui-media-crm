import { createServerSupabaseClient } from '@/lib/supabase'
import { FileText } from 'lucide-react'
import Link from 'next/link'
import SearchInput from '@/components/SearchInput'
import DocumentsTable from './DocumentsTable'

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
    .select('id, name, doc_type, content, created_at, client_id, sent_at, viewed_at, clients(id, name)')
    .order('created_at', { ascending: false })
  if (params.clientId) query = query.eq('client_id', params.clientId)
  if (search) query = query.ilike('name', `%${search}%`)

  // Proposals live in their own table (they have a page the client accepts on),
  // but to Arlo they are paperwork like the rest, so they are listed here too.
  let proposalQuery = supabase
    .from('proposals')
    .select('id, status, created_at, job_id, viewed_at, jobs!inner(id, name, client_id, clients(id, name))')
    .order('created_at', { ascending: false })
  if (params.clientId) proposalQuery = proposalQuery.eq('jobs.client_id', params.clientId)
  if (search) proposalQuery = proposalQuery.ilike('jobs.name', `%${search}%`)

  const [{ data: docs }, { data: proposals }] = await Promise.all([query, proposalQuery])

  const docRows = (docs ?? []).map((d) => {
    let signed = false
    let isStructured = false
    try {
      const form = JSON.parse(d.content as string)?.form
      isStructured = Boolean(form)
      signed = Boolean(form?.clientSignature)
    } catch { /* free text */ }
    const client = d.clients as unknown as { id: string; name: string } | null
    return { id: d.id, href: `/dashboard/documents/${d.id}`, name: d.name as string, doc_type: d.doc_type as string | null, created_at: d.created_at as string, client, signed, isStructured, proposalStatus: null as string | null, viewedAt: (d.viewed_at as string | null) ?? null, sentAt: (d.sent_at as string | null) ?? null }
  })
  const proposalRows = (proposals ?? []).map((p) => {
    const job = p.jobs as unknown as { id: string; name: string; clients: { id: string; name: string } | null }
    return { id: p.id, href: `/dashboard/jobs/${p.job_id}/proposal/${p.id}`, name: `Proposal - ${job.name}`, doc_type: 'proposal', created_at: p.created_at as string, client: job.clients, signed: false, isStructured: false, proposalStatus: p.status as string, viewedAt: (p.viewed_at as string | null) ?? null, sentAt: null as string | null }
  })
  const rows = [...docRows, ...proposalRows].sort((x, y) => y.created_at.localeCompare(x.created_at))
  const clientName = params.clientId ? rows[0]?.client?.name : null

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">
            {clientName ? `Everything for ${clientName}.` : 'Every proposal, contract and document. Ask Tui to draft a new one.'}
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
            {search ? 'Try a different search.' : 'Ask Tui to draft a proposal or contract and it will appear here.'}
          </p>
        </div>
      ) : (
        <DocumentsTable rows={rows} />
      )}
    </div>
  )
}
