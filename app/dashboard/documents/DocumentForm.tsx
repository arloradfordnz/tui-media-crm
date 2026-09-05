'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Save, Mail, Trash2, Check, Sparkles } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import Field from '@/components/Field'
import DatePicker from '@/components/DatePicker'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'

const TEMPLATES = ['Contract', 'Quote', 'Call Sheet', 'General Document']

export type ClientOption = {
  id: string
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  location: string | null
  portalToken: string | null
}

export type DocFormShape = {
  clientName: string
  contactPerson: string
  clientEmail: string
  clientPhone: string
  businessName: string
  date: string
  jobDescription: string
  shootDate: string
  location: string
  body: string
  clientSignature: string
  clientSignedAt: string
  documentNumber: string
}

async function fetchNextDocumentNumber(): Promise<string> {
  try {
    const res = await fetch('/api/documents/next-number', { cache: 'no-store' })
    if (!res.ok) throw new Error('failed')
    const data = await res.json()
    if (typeof data.number === 'string') return data.number
  } catch (err) {
    console.warn('Failed to fetch next document number, using fallback:', err)
  }
  return '#100'
}

export type CreateMode = { kind: 'create'; initialClientId?: string }
export type EditMode = {
  kind: 'edit'
  docId: string
  docName: string
  docType: string
  initialTemplate: string
  initialForm: DocFormShape
  initialClientId: string | null
}

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

export default function DocumentForm({ clients, mode }: { clients: ClientOption[]; mode: CreateMode | EditMode }) {
  const router = useRouter()
  const isEdit = mode.kind === 'edit'

  const initialClientId = mode.kind === 'create' ? mode.initialClientId || '' : mode.initialClientId || ''
  const initialClient = clients.find((c) => c.id === initialClientId)

  const [template, setTemplate] = useState(mode.kind === 'edit' ? mode.initialTemplate || 'Contract' : 'Contract')
  const [selectedClientId, setSelectedClientId] = useState(initialClientId)
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)
  const [form, setForm] = useState<DocFormShape>(() => {
    if (mode.kind === 'edit') return { ...EMPTY_FORM, ...mode.initialForm }
    return {
      ...EMPTY_FORM,
      clientName: initialClient?.name || '',
      contactPerson: initialClient?.contactPerson || '',
      clientEmail: initialClient?.email || '',
      clientPhone: initialClient?.phone || '',
      location: initialClient?.location || '',
    }
  })

  // Fetch a fresh sequential document number whenever the form lacks one.
  useEffect(() => {
    let cancelled = false
    if (form.documentNumber) return
    void fetchNextDocumentNumber().then((n) => {
      if (cancelled) return
      setForm((prev) => (prev.documentNumber ? prev : { ...prev, documentNumber: n }))
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [docName, setDocName] = useState(mode.kind === 'edit' ? mode.docName : '')

  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  function update<K extends keyof DocFormShape>(key: K, value: DocFormShape[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleClientChange(id: string) {
    setSelectedClientId(id)
    const c = clients.find((x) => x.id === id)
    if (!c) return
    setForm((prev) => ({
      ...prev,
      clientName: c.name,
      contactPerson: c.contactPerson || '',
      clientEmail: c.email || '',
      clientPhone: c.phone || '',
      location: c.location || prev.location,
    }))
  }

  useEffect(() => {
    if (mode.kind === 'create' && mode.initialClientId && initialClient) {
      setSelectedClientId(mode.initialClientId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fileNameSafe = `${template.replace(/\s+/g, '_')}_${form.clientName || 'document'}.pdf`
  const inferredName = `${template} - ${form.clientName || 'Untitled'}`

  async function buildPdfBlob(): Promise<Blob> {
    const { pdf } = await import('@react-pdf/renderer')
    const { default: TuiDocument } = await import('./TuiPdfDocument')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await pdf(TuiDocument({ template, form }) as any).toBlob()
  }

async function persistNew() {
    await fetch('/api/documents/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: inferredName,
        docType: template.toLowerCase().replace(/\s+/g, '_'),
        content: JSON.stringify({ template, form }),
        clientId: selectedClientId || null,
      }),
    })
  }

  async function persistEdit() {
    if (mode.kind !== 'edit') return
    const fd = new FormData()
    fd.append('docId', mode.docId)
    fd.append('name', docName || inferredName)
    fd.append('docType', template.toLowerCase().replace(/\s+/g, '_'))
    fd.append('content', JSON.stringify({ template, form }))
    fd.append('clientId', selectedClientId || '')
    await fetch('/api/documents/update', { method: 'POST', body: fd }).catch(() => {})
  }

  async function handleDownloadPdf() {
    setGenerating(true)
    try {
      const blob = await buildPdfBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileNameSafe
      a.click()
      URL.revokeObjectURL(url)
      if (mode.kind === 'create') await persistNew()
      else await persistEdit()
    } catch (err) {
      console.error('PDF generation error:', err)
    }
    setGenerating(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (mode.kind === 'create') {
        await persistNew()
        router.refresh()
        router.push('/dashboard/documents')
      } else {
        await persistEdit()
        router.refresh()
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function handleEmailToClient() {
    setEmailError(null)
    setEmailSent(false)
    if (!form.clientEmail) {
      setEmailError('Add a client email first.')
      return
    }
    if (!selectedClientId) {
      setEmailError('Select a client so we can link the portal.')
      return
    }
    const clientPortalToken = clients.find((c) => c.id === selectedClientId)?.portalToken || null
    if (!clientPortalToken) {
      setEmailError('This client has no portal link yet — open their record and generate one first.')
      return
    }
    setEmailing(true)
    try {
      // Persist the doc first so it shows up in the portal when the client opens the link
      if (mode.kind === 'create') await persistNew()
      else await persistEdit()

      const res = await fetch('/api/documents/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: form.clientEmail,
          clientName: form.contactPerson || form.clientName,
          docName: inferredName,
          template,
          clientId: selectedClientId,
          portalToken: clientPortalToken,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEmailError(data.error || 'Failed to send.')
      } else {
        setEmailSent(true)
        setTimeout(() => setEmailSent(false), 3000)
      }
    } catch (err) {
      console.error('Email error:', err)
      setEmailError('Failed to send.')
    }
    setEmailing(false)
  }

  async function handleDraft() {
    if (drafting) return
    setDrafting(true)
    setDraftError(null)
    try {
      const res = await fetch('/api/ai/document-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'oneshot',
          template,
          clientName: form.clientName,
          businessName: form.businessName,
          contactPerson: form.contactPerson,
          jobDescription: form.jobDescription,
          location: form.location,
          date: form.date,
          shootDate: form.shootDate,
        }),
      })
      if (!res.ok) {
        let message = 'Could not draft that. Try again.'
        try { message = (await res.json()).error || message } catch { /* not JSON */ }
        setDraftError(message)
        return
      }
      // Stream into the field so it fills in front of you, rather than sitting
      // blank for fifteen seconds and then appearing all at once.
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let out = ''
      update('body', '')
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        out += decoder.decode(value, { stream: true })
        update('body', out)
      }
      if (!out.trim()) setDraftError('The draft came back empty. Try again.')
    } catch {
      setDraftError('Could not reach the drafting service.')
    } finally {
      setDrafting(false)
    }
  }

  function handleDelete() {
    if (mode.kind !== 'edit') return
    const docId = mode.docId
    setConfirm({
      title: `Delete ${docName || 'this document'}?`,
      body: 'The saved document goes. Anything already sent to a client stays sent.',
      confirmLabel: 'Delete document',
      destructive: true,
      onConfirm: async () => {
        setDeleting(true)
        const fd = new FormData()
        fd.append('docId', docId)
        await fetch('/api/documents/delete', { method: 'POST', body: fd }).catch(() => {})
        router.push('/dashboard/documents')
      },
    })
  }

  return (
    <div className="lg:flex lg:items-stretch lg:gap-8">
    <div className="card space-y-5 lg:flex-1 lg:min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {isEdit ? 'Edit Document' : 'Generate PDF'}
        </h2>
        <div style={{ minWidth: '200px' }}>
          <CustomSelect
            value={template}
            onChange={setTemplate}
            options={TEMPLATES.map((t) => ({ value: t, label: t }))}
          />
        </div>
      </div>

      {isEdit && (
        <Field label="Document name">
          <input value={docName} onChange={(e) => setDocName(e.target.value)} className="field-input" />
        </Field>
      )}

      <Field label="Client">
        <CustomSelect
          value={selectedClientId}
          onChange={handleClientChange}
          placeholder="Select a client to autofill, or leave blank"
          searchable
          options={[{ value: '', label: 'No client (manual entry)' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Client name">
          <input value={form.clientName} onChange={(e) => update('clientName', e.target.value)} className="field-input" />
        </Field>
        <Field label="Key contact person">
          <input value={form.contactPerson} onChange={(e) => update('contactPerson', e.target.value)} className="field-input" placeholder="Jane Smith" />
        </Field>
        <Field label="Client email">
          <input value={form.clientEmail} onChange={(e) => update('clientEmail', e.target.value)} className="field-input" type="email" />
        </Field>
        <Field label="Client phone">
          <input value={form.clientPhone} onChange={(e) => update('clientPhone', e.target.value)} className="field-input" />
        </Field>
        {/* Ours, not theirs. Two fields both reading as "business name" was the
            confusion; this is the one that signs the document. */}
        <Field label="Your business">
          <input value={form.businessName} onChange={(e) => update('businessName', e.target.value)} className="field-input" />
        </Field>
        <Field label="Date">
          <DatePicker value={form.date} onChange={(v) => update('date', v)} className="field-input" />
        </Field>
        <Field label="Shoot date">
          <DatePicker value={form.shootDate} onChange={(v) => update('shootDate', v)} className="field-input" />
        </Field>
        <Field label="Job description" className="sm:col-span-2">
          <input value={form.jobDescription} onChange={(e) => update('jobDescription', e.target.value)} className="field-input" />
        </Field>
        <Field label="Location" className="sm:col-span-2">
          <input value={form.location} onChange={(e) => update('location', e.target.value)} className="field-input" />
        </Field>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-1">
            <label className="field-label !mb-0">Content</label>
            {/* Drafting is one button on the field it fills, not a side panel
                that interviews you first. Everything the interview asked for
                is already on this form. */}
            <button
              type="button"
              onClick={handleDraft}
              disabled={drafting}
              className="btn-ghost"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {drafting ? 'Writing…' : form.body.trim() ? 'Redraft with AI' : 'Draft with AI'}
            </button>
          </div>
          <textarea
            value={form.body}
            onChange={(e) => update('body', e.target.value)}
            rows={10}
            className="field-input"
            style={drafting ? { opacity: 0.75 } : undefined}
            placeholder="Write your document content here, or press Draft with AI to have one written from the details above.&#10;&#10;Formatting: # Heading, ## Subheading, ### Small heading, **bold text**"
          />
          {draftError && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{draftError}</p>}
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Formatting: <code># Heading</code>, <code>## Subheading</code>, <code>### Small heading</code>, <code>**bold**</code></p>
        </div>
      </div>

      {emailError && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{emailError}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={handleDownloadPdf} disabled={generating} className="btn-primary">
          <Download className="w-4 h-4" /> {generating ? 'Generating...' : 'Download PDF'}
        </button>
        <button onClick={handleEmailToClient} disabled={emailing || !form.clientEmail} className="btn-primary" title={!form.clientEmail ? 'Add a client email to enable' : ''}>
          {emailSent ? <Check className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
          {emailing ? 'Sending...' : emailSent ? 'Sent!' : 'Email to Client'}
        </button>
        <button onClick={handleSave} disabled={saving} className="btn-secondary">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save as Template'}
        </button>
        {isEdit && (
          <button onClick={handleDelete} disabled={deleting} className="btn-danger ml-auto">
            <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>

    </div>
    <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
    </div>
  )
}
