'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Check, Copy, Download, ExternalLink, Mail, MapPin, MessageSquare, Save, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { keepScroll } from '@/lib/keep-scroll'
import CustomSelect from '@/components/CustomSelect'
import Field from '@/components/Field'
import DatePicker from '@/components/DatePicker'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'
import DocumentBody from '@/components/DocumentBody'

// One page for reading, tweaking and sending a saved document, laid out like
// the proposal editor (jobs/[id]/proposal/[proposalId]/ProposalEditor.tsx):
// the header carries the actions, "What the client sees" shows the document
// set the way it reads, Edit holds the fields in grouped cards, and the status,
// feedback and portal link sit in the column on the right. It used to be one
// card with every field and an unformatted markdown box, which made a contract
// Tui had drafted look like a form to fill in.

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

type Feedback = { message: string; createdAt: string; author: string }
type DocData = { id: string; name: string; docType: string; content: string; clientId: string | null; createdAt: string }

const today = () => new Date().toISOString().split('T')[0]

const EMPTY_FORM: DocFormShape = {
  clientName: '',
  contactPerson: '',
  clientEmail: '',
  clientPhone: '',
  businessName: 'Tui Media',
  date: today(),
  jobDescription: '',
  shootDate: '',
  location: '',
  body: '',
  clientSignature: '',
  clientSignedAt: '',
  documentNumber: '',
}

// Written out in full, the way the client reads it.
// A bare "2026-10-15" is a calendar date, so it is read and printed in UTC and
// cannot slip a day; a full timestamp is shown as the day it was in NZ.
const longDate = (iso: string | null | undefined) =>
  !iso ? '' : iso.length === 10
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-NZ', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })

function parseContent(content: string): { template: string; form: DocFormShape; feedback: Feedback[]; signedAtISO: string } | null {
  if (!content) return null
  try {
    const obj = JSON.parse(content)
    // Accept docs missing `template` (older or bug-affected rows) — default
    // the template so the editor and parsed form still render.
    if (obj && typeof obj === 'object' && 'form' in obj) {
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
        signedAtISO: get('clientSignedAtISO'),
        form: {
          clientName: get('clientName'),
          contactPerson: get('contactPerson'),
          clientEmail: get('clientEmail'),
          clientPhone: get('clientPhone'),
          businessName: get('businessName') || 'Tui Media',
          date: get('date') || today(),
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

export default function DocumentEditor({ doc, clients }: { doc: DocData; clients: ClientOption[] }) {
  const router = useRouter()
  const [parsed] = useState(() => parseContent(doc.content))
  const feedback = parsed?.feedback ?? []

  // An old free-text doc keeps its text as the body so nothing is lost.
  const [template, setTemplate] = useState(parsed?.template || (doc.docType === 'contract' ? 'Contract' : 'General Document'))
  const [form, setForm] = useState<DocFormShape>(() => ({ ...EMPTY_FORM, ...(parsed?.form ?? { body: doc.content || '' }) }))
  const [docName, setDocName] = useState(doc.name)
  const [selectedClientId, setSelectedClientId] = useState(doc.clientId || '')
  const [tab, setTab] = useState<'edit' | 'preview'>(form.body ? 'preview' : 'edit')
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)

  const isContract = template === 'Contract'
  const isSigned = !!form.clientSignature
  const client = clients.find((c) => c.id === selectedClientId) ?? null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'
  const portalUrl = client?.portalToken ? `${baseUrl}/portal/client/${client.portalToken}` : null
  const title = form.jobDescription || docName || template
  const inferredName = `${template} - ${form.clientName || 'Untitled'}`

  // A document without a number gets the next one, as it always has.
  useEffect(() => {
    if (form.documentNumber) return
    let cancelled = false
    void fetchNextDocumentNumber().then((n) => {
      if (!cancelled) setForm((prev) => (prev.documentNumber ? prev : { ...prev, documentNumber: n }))
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof DocFormShape>(key: K, value: DocFormShape[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  function handleClientChange(id: string) {
    setSelectedClientId(id)
    setDirty(true)
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

  async function save(): Promise<boolean> {
    const fd = new FormData()
    fd.append('docId', doc.id)
    fd.append('name', docName || inferredName)
    fd.append('docType', template.toLowerCase().replace(/\s+/g, '_'))
    fd.append('content', JSON.stringify({ template, form }))
    fd.append('clientId', selectedClientId || '')
    try {
      const res = await fetch('/api/documents/update', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setNotice({ kind: 'error', text: data.error || "Couldn't save. Try again." })
        return false
      }
      setDirty(false)
      return true
    } catch {
      setNotice({ kind: 'error', text: "Couldn't save. Check your connection and try again." })
      return false
    }
  }

  async function handleSave() {
    setNotice(null)
    setSaving(true)
    const restore = keepScroll()
    // No router.refresh(): the editor already holds what was saved, and a
    // refresh re-rendered the page and threw the scroll back to the top.
    if (await save()) setNotice({ kind: 'ok', text: 'Saved.' })
    setSaving(false)
    restore()
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { default: TuiDocument } = await import('../TuiPdfDocument')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(TuiDocument({ template, form }) as any).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${template.replace(/\s+/g, '_')}_${form.clientName || 'document'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation error:', err)
      setNotice({ kind: 'error', text: "Couldn't make the PDF. Try again." })
    }
    setDownloading(false)
  }

  function handleEmail() {
    setNotice(null)
    if (!form.clientEmail) return setNotice({ kind: 'error', text: 'Add a client email first (Edit, Who it is for).' })
    if (!client) return setNotice({ kind: 'error', text: 'Pick a client so the email can link to their portal.' })
    if (!client.portalToken) return setNotice({ kind: 'error', text: `${client.name} has no portal link yet. Open their record and generate one first.` })
    const portalToken = client.portalToken
    setConfirm({
      title: `Email this to ${form.contactPerson || form.clientName}?`,
      body: `${form.clientEmail} gets an email with a link to read${isContract && !isSigned ? ' and sign' : ''} it in their portal. Unsaved changes are saved first.`,
      confirmLabel: 'Send email',
      onConfirm: async () => {
        setEmailing(true)
        const restore = keepScroll()
        // Saved first, so what the client opens is what is on screen.
        if (await save()) {
          try {
            const res = await fetch('/api/documents/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: form.clientEmail,
                clientName: form.contactPerson || form.clientName,
                docName: docName || inferredName,
                template,
                clientId: selectedClientId,
                portalToken,
              }),
            })
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              setNotice({ kind: 'error', text: data.error || "The email didn't go out. Try again." })
            } else {
              setNotice({ kind: 'ok', text: `Sent to ${form.clientEmail}.` })
            }
          } catch {
            setNotice({ kind: 'error', text: "The email didn't go out. Try again." })
          }
        }
        setEmailing(false)
        restore()
      },
    })
  }

  function handleDelete() {
    setConfirm({
      title: `Delete ${docName || 'this document'}?`,
      body: 'The saved document goes. Anything already sent to a client stays sent.',
      confirmLabel: 'Delete document',
      destructive: true,
      onConfirm: async () => {
        setDeleting(true)
        const fd = new FormData()
        fd.append('docId', doc.id)
        await fetch('/api/documents/delete', { method: 'POST', body: fd }).catch(() => {})
        router.push('/dashboard/documents')
      },
    })
  }

  async function copyLink() {
    if (!portalUrl) return
    try { await navigator.clipboard.writeText(portalUrl) } catch { /* clipboard blocked */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const timeline = [
    { label: 'Drafted', at: doc.createdAt, done: true },
    { label: 'Signed', at: parsed?.signedAtISO || null, done: isSigned },
  ]

  return (
    <div className="space-y-6">
      <Link href="/dashboard/documents" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Documents
      </Link>

      <div className="page-header">
        <div className="page-header-left">
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{template}</p>
          <h1 className="page-title">{title}</h1>
          {(client || form.clientName) && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              For {client ? <Link href={`/dashboard/clients/${client.id}`} style={{ color: 'var(--accent)' }}>{client.name}</Link> : form.clientName}
              {form.contactPerson ? ` · ${form.contactPerson}` : ''}
            </p>
          )}
        </div>
        <div className="page-header-actions">
          <button type="button" onClick={handleDownload} disabled={downloading} className="btn-secondary">
            <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          {dirty && (
            <button type="button" onClick={handleSave} disabled={saving || emailing} className="btn-secondary">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          <button type="button" onClick={handleEmail} disabled={emailing || saving} className="btn-primary">
            <Mail className="w-4 h-4" /> {emailing ? 'Sending…' : 'Email to client'}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`alert ${notice.kind === 'ok' ? 'alert-success' : 'alert-danger'}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="tab-pills" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'edit'} className={`tab-pill${tab === 'edit' ? ' active' : ''}`} onClick={() => setTab('edit')}>
          Edit
        </button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={`tab-pill${tab === 'preview' ? ' active' : ''}`} onClick={() => setTab('preview')}>
          What the client sees
        </button>
      </div>

      <div className="prop-editor-grid">
        <div className="space-y-5 min-w-0">
          {tab === 'preview' && (
            <div className="card prop-preview">
              <div className="prop-preview-head">
                <p className="prop-eyebrow">{[template, form.documentNumber, longDate(form.date)].filter(Boolean).join(' · ')}</p>
                <h2 className="prop-title prop-title-sm">{title}</h2>
                {form.clientName && (
                  <p className="prop-for">Prepared for {form.contactPerson ? `${form.contactPerson}, ` : ''}{form.clientName}</p>
                )}
                {(form.shootDate || form.location) && (
                  <div className="prop-meta">
                    {form.shootDate && <span><Calendar className="w-3.5 h-3.5" /> {longDate(form.shootDate)}</span>}
                    {form.location && <span><MapPin className="w-3.5 h-3.5" /> {form.location}</span>}
                  </div>
                )}
              </div>

              {form.body
                ? <DocumentBody body={form.body} />
                : <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nothing written yet. Ask Tui to draft it, or write it in Edit.</p>}

              {isContract && (
                <section className="doc-approval">
                  <h2 className="prop-h">Approval</h2>
                  <p className="doc-para">By signing below, both parties agree to the scope, terms and payment set out in this contract.</p>
                  <div className="doc-sign">
                    <div>
                      <div className="doc-sign-line">Arlo Radford</div>
                      <p className="doc-sign-name">Arlo Radford</p>
                      <p className="doc-sign-meta">Tui Media</p>
                    </div>
                    <div>
                      <div className={`doc-sign-line${isSigned ? '' : ' is-empty'}`}>{isSigned ? form.clientSignature : 'Awaiting signature'}</div>
                      <p className="doc-sign-name">{form.contactPerson || form.clientName || 'Client'}</p>
                      <p className="doc-sign-meta">
                        {[form.contactPerson && form.clientName ? form.clientName : '', isSigned && form.clientSignedAt ? `Signed ${form.clientSignedAt}` : ''].filter(Boolean).join(' · ') || 'Client'}
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === 'edit' && (
            <div className="space-y-5">
              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">{isContract ? 'The agreement' : 'What it says'}</h3>
                  <p className="prop-edit-hint">
                    {isContract
                      ? 'Tui drafted this. Start a line with # for a section heading, **bold** a key term, and leave a blank line between clauses.'
                      : 'Start a line with # for a heading and **bold** a key term. A blank line starts a new paragraph.'}
                  </p>
                </div>
                {isSigned && (
                  <p className="alert alert-warning text-sm">{form.clientSignature} has already signed this. Changing the wording now changes what they agreed to.</p>
                )}
                <textarea rows={22} value={form.body} onChange={(e) => update('body', e.target.value)} className="field-input doc-edit-body" aria-label="Document text" />
              </section>

              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">Who it&apos;s for</h3>
                  <p className="prop-edit-hint">Picking a client fills these from their record.</p>
                </div>
                <Field label="Client">
                  <CustomSelect
                    value={selectedClientId}
                    onChange={handleClientChange}
                    placeholder="Select a client"
                    searchable
                    options={[{ value: '', label: 'No client (manual entry)' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Client name">
                    <input value={form.clientName} onChange={(e) => update('clientName', e.target.value)} className="field-input" />
                  </Field>
                  <Field label="Key contact person">
                    <input value={form.contactPerson} onChange={(e) => update('contactPerson', e.target.value)} className="field-input" />
                  </Field>
                  <Field label="Client email">
                    <input value={form.clientEmail} onChange={(e) => update('clientEmail', e.target.value)} className="field-input" type="email" />
                  </Field>
                  <Field label="Client phone">
                    <input value={form.clientPhone} onChange={(e) => update('clientPhone', e.target.value)} className="field-input" />
                  </Field>
                </div>
              </section>

              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">The project</h3>
                  <p className="prop-edit-hint">The project line is the title the client sees.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Project" className="sm:col-span-2">
                    <input value={form.jobDescription} onChange={(e) => update('jobDescription', e.target.value)} className="field-input" />
                  </Field>
                  <Field label="Location">
                    <input value={form.location} onChange={(e) => update('location', e.target.value)} className="field-input" />
                  </Field>
                  <Field label="Shoot date">
                    <DatePicker value={form.shootDate} onChange={(v) => update('shootDate', v)} className="field-input" />
                  </Field>
                </div>
              </section>

              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">Document</h3>
                  <p className="prop-edit-hint">How it is listed on the Documents page, and what kind it is.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Document name" className="sm:col-span-2">
                    <input value={docName} onChange={(e) => { setDocName(e.target.value); setDirty(true) }} className="field-input" />
                  </Field>
                  <Field label="Type">
                    <CustomSelect value={template} onChange={(v) => { setTemplate(v); setDirty(true) }} options={TEMPLATES.map((t) => ({ value: t, label: t }))} />
                  </Field>
                  <Field label="Document date">
                    <DatePicker value={form.date} onChange={(v) => update('date', v)} className="field-input" />
                  </Field>
                </div>
              </section>
            </div>
          )}
        </div>

        <aside className="prop-aside">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <span className="label">Status</span>
              {isContract
                ? <span className={`badge ${isSigned ? 'badge-success' : 'badge-muted'}`}>{isSigned ? 'Signed' : 'Awaiting signature'}</span>
                : <span className="badge badge-muted">{template}</span>}
            </div>
            {form.documentNumber && (
              <div className="flex items-center justify-between">
                <span className="label">Number</span>
                <span className="text-sm" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{form.documentNumber}</span>
              </div>
            )}
            {isContract ? (
              <ol className="prop-timeline">
                {timeline.map((t) => (
                  <li key={t.label} className={t.done ? 'is-done' : ''}>
                    <span className="prop-timeline-dot">{t.done && <Check className="w-3 h-3" />}</span>
                    <span className="prop-timeline-label">{t.label}</span>
                    <span className="prop-timeline-at">{t.at ? formatDate(t.at) : t.done ? form.clientSignedAt : ''}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex items-center justify-between">
                <span className="label">Created</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(doc.createdAt)}</span>
              </div>
            )}
          </div>

          {feedback.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="label">Client feedback</span>
                <span className="badge badge-muted ml-auto">{feedback.length}</span>
              </div>
              {feedback.map((fb, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fb.author}</span>
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{fb.createdAt ? formatDate(fb.createdAt) : ''}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{fb.message}</p>
                </div>
              ))}
            </div>
          )}

          {portalUrl && client && (
            <div className="card space-y-4">
              <span className="label">Client portal</span>
              <code className="prop-link">{portalUrl.replace(/^https?:\/\//, '')}</code>
              <div className="flex gap-2">
                <button type="button" onClick={copyLink} className="btn-secondary btn-sm flex-1">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
                </button>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm flex-1">
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Shows in {client.name}&apos;s portal{isContract ? ', where they read and sign it' : ''}.
              </p>
            </div>
          )}

          <button type="button" onClick={handleDelete} disabled={deleting} className="btn-ghost btn-sm doc-delete">
            <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Deleting…' : 'Delete document'}
          </button>
        </aside>
      </div>

      <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
    </div>
  )
}
