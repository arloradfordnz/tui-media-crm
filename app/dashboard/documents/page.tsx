import { db } from '@/lib/db'
import { formatDate, statusLabel } from '@/lib/format'
import { FileText, Plus } from 'lucide-react'
import Link from 'next/link'
import NewDocButton from './NewDocButton'

export default async function DocumentsPage() {
  const documents = await db.document.findMany({ orderBy: { updatedAt: 'desc' } })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Documents & Templates</h1>
        <NewDocButton />
      </div>

      {documents.length === 0 ? (
        <div className="empty-state card">
          <FileText className="w-10 h-10 empty-icon" />
          <p className="empty-title">No documents yet</p>
          <p className="empty-description">Create your first template to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((d) => (
            <Link key={d.id} href={`/dashboard/documents/${d.id}`} className="card hover:border-[var(--accent)] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <FileText className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                <span className="badge badge-muted">{statusLabel(d.docType)}</span>
              </div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.name}</h3>
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Edited {formatDate(d.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
