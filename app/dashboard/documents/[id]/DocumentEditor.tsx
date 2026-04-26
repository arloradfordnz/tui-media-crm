'use client'

import Link from 'next/link'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import DocumentForm, { type ClientOption, type DocFormShape } from '../DocumentForm'

type Feedback = { message: string; createdAt: string; author: string }
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

function parseContent(content: string): { template: string; form: DocFormShape; feedback: Feedback[] } | null {
  if (!content) return null
  try {
    const obj = JSON.parse(content)
    if (obj && typeof obj === 'object' && 'template' in obj && 'form' in obj) {
      const f = (obj.form ?? {}) as Record<string, unknown>
      const get = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '')
      const rawFb = Array.isArray((obj as { feedback?: unknown }).feedback)
        ? ((obj as { feedback: unknown[] }).feedback as Array<Record<string, unknown>>)
        : []
      const feedback: Feedback[] = rawFb.map((r) => ({
        message: String(r.message ?? ''),
        createdAt: String(r.createdAt ?? ''),
        author: String(r.author ?? ''),
      }))
      return {
        template: String(obj.template ?? 'Contract'),
        feedback,
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

      {parsed?.feedback && parsed.feedback.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Client feedback</h2>
            <span className="badge badge-muted">{parsed.feedback.length}</span>
          </div>
          <div className="space-y-2">
            {parsed.feedback.map((fb, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fb.author}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                    {fb.createdAt ? new Date(fb.createdAt).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{fb.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
