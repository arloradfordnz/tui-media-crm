'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DocumentForm, { type ClientOption, type DocFormShape } from '../DocumentForm'

type DocData = { id: string; name: string; docType: string; content: string; clientId: string | null }

const EMPTY_FORM: DocFormShape = {
  clientName: '',
  contactPerson: '',
  clientEmail: '',
  clientPhone: '',
  businessName: 'Tui Media',
  date: new Date().toISOString().split('T')[0],
  jobDescription: '',
  shootDate: '',
  location: '',
  body: '',
  clientSignature: '',
  clientSignedAt: '',
  documentNumber: '',
}

function parseContent(content: string): { template: string; form: DocFormShape } | null {
  if (!content) return null
  try {
    const obj = JSON.parse(content)
    if (obj && typeof obj === 'object' && 'template' in obj && 'form' in obj) {
      const f = (obj.form ?? {}) as Record<string, unknown>
      const get = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '')
      return {
        template: String(obj.template ?? 'Contract'),
        form: {
          clientName: get('clientName'),
          contactPerson: get('contactPerson'),
          clientEmail: get('clientEmail'),
          clientPhone: get('clientPhone'),
          businessName: get('businessName') || 'Tui Media',
          date: get('date') || new Date().toISOString().split('T')[0],
          jobDescription: get('jobDescription'),
          shootDate: get('shootDate'),
          location: get('location'),
          body: get('body'),
          clientSignature: get('clientSignature'),
          clientSignedAt: get('clientSignedAt'),
          documentNumber: get('documentNumber'),
        },
      }
    }
  } catch { /* fall through */ }
  return null
}

export default function DocumentEditor({ doc, clients }: { doc: DocData; clients: ClientOption[] }) {
  const parsed = parseContent(doc.content)
  // If it's an old free-text doc, fall back to body so it isn't lost
  const initialTemplate = parsed?.template || (doc.docType === 'contract' ? 'Contract' : 'General Document')
  const initialForm = parsed?.form || { ...EMPTY_FORM, body: doc.content || '' }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/dashboard/documents" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Documents
      </Link>

      <DocumentForm
        clients={clients}
        mode={{
          kind: 'edit',
          docId: doc.id,
          docName: doc.name,
          docType: doc.docType,
          initialTemplate,
          initialForm,
          initialClientId: doc.clientId,
        }}
      />
    </div>
  )
}
