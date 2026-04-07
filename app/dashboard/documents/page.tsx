import { createServerSupabaseClient } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { FileText } from 'lucide-react'
import Link from 'next/link'
import PdfGenerator from './PdfGenerator'

export default async function DocumentsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: documents } = await supabase
    .from('documents')
    .select('id, name, doc_type, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Documents & PDF Generator</h1>

      {/* PDF Generator */}
      <PdfGenerator />

      {/* Saved Templates */}
      {(documents ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Saved Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(documents ?? []).map((d) => (
              <Link key={d.id} href={`/dashboard/documents/${d.id}`} className="card hover:border-[var(--accent)] transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <FileText className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  <span className="badge badge-muted">{d.doc_type}</span>
                </div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.name}</h3>
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Edited {formatDate(d.updated_at)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
