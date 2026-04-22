import { createServerSupabaseClient } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { FileText } from 'lucide-react'
import Link from 'next/link'
import PdfGenerator from './PdfGenerator'
import NewDocButton from './NewDocButton'

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()

  type DocRow = { id: string; name: string; doc_type: string; updated_at: string; clients?: { name: string } | null }

  // Try with client_id join, fall back to basic query if column doesn't exist yet
  let documents: DocRow[] = []
  const { data: docsWithClient, error: docErr } = await supabase
    .from('documents').select('id, name, doc_type, updated_at, client_id, clients(name)').order('updated_at', { ascending: false })
  if (docErr) {
    const { data: docsBasic } = await supabase
      .from('documents').select('id, name, doc_type, updated_at').order('updated_at', { ascending: false })
    documents = (docsBasic ?? []) as DocRow[]
  } else {
    documents = (docsWithClient ?? []) as unknown as DocRow[]
  }
  const { data: clients } = await supabase.from('clients').select('id, name, contact_person, email, phone, location').order('name', { ascending: true })
  const clientOptions = (clients ?? []).map((c) => ({ id: c.id, name: c.name, contactPerson: c.contact_person, email: c.email, phone: c.phone, location: c.location }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Documents & PDF Generator</h1>
        <NewDocButton clients={clientOptions.map((c) => ({ id: c.id, name: c.name }))} defaultClientId={params.clientId} />
      </div>

      {/* PDF Generator */}
      <PdfGenerator clients={clientOptions} initialClientId={params.clientId} />

      {/* Saved Templates */}
      {documents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Saved Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((d) => {
              const clientName = d.clients?.name
              return (
                <Link key={d.id} href={`/dashboard/documents/${d.id}`} className="card hover:border-[var(--accent)] transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <FileText className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                    <span className="badge badge-muted">{d.doc_type}</span>
                  </div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.name}</h3>
                  {clientName && <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>{clientName}</p>}
                  <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Edited {formatDate(d.updated_at)}</p>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
