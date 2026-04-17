'use client'

import { useActionState, useState } from 'react'
import { updateDocument, deleteDocument } from '@/app/actions/documents'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'

const DOC_TYPES = ['contract', 'callsheet', 'shotlist', 'questionnaire']

type DocData = { id: string; name: string; docType: string; content: string; clientId: string | null }
type ClientOption = { id: string; name: string }

export default function DocumentEditor({ doc, clients }: { doc: DocData; clients: ClientOption[] }) {
  const [state, action, pending] = useActionState(updateDocument, undefined)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this document?')) return
    setDeleting(true)
    await deleteDocument(doc.id)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/dashboard/documents" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Documents
      </Link>

      <form action={action} className="space-y-4">
        <input type="hidden" name="docId" value={doc.id} />
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="field-label">Document Name</label>
            <input name="name" defaultValue={doc.name} required className="field-input" />
          </div>
          <div>
            <label className="field-label">Type</label>
            <CustomSelect
              name="docType"
              defaultValue={doc.docType}
              options={DOC_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
            />
          </div>
          <div>
            <label className="field-label">Client</label>
            <CustomSelect
              name="clientId"
              defaultValue={doc.clientId || ''}
              placeholder="None"
              searchable
              options={[{ value: '', label: 'None' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        </div>

        <div>
          <label className="field-label">Content</label>
          <textarea
            name="content"
            defaultValue={doc.content}
            rows={24}
            className="field-input"
            style={{ fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }}
            placeholder="Write your template content here..."
          />
        </div>

        {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            <Save className="w-4 h-4" /> {pending ? 'Saving...' : 'Save Document'}
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting} className="btn-danger">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </form>
    </div>
  )
}
