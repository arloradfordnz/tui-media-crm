'use client'

import { useActionState, useEffect, useState } from 'react'
import { approveDelivery, markViewed, requestDeliverableRevision } from '@/app/actions/portal'
import { signDocumentByClient } from '@/app/actions/documents'
import { statusLabel, statusBadgeClass, formatDate } from '@/lib/format'
import Image from 'next/image'
import { Briefcase, FileText, Film, Image as ImageIcon, File, Music, Download, ChevronDown, ChevronRight, Check, MessageSquare, PenLine } from 'lucide-react'

type DeliveryFile = {
  id: string
  originalName: string
  fileUrl: string | null
  mimeType: string | null
  versionLabel: string
  deliveryStatus: string
  downloadEnabled: boolean
  personalNote: string | null
  createdAt: string
}

type Revision = {
  id: string
  round: number
  request: string
  status: string
  createdAt: string
}

type Deliverable = {
  id: string
  title: string
  description: string | null
  completed: boolean
  revisionLimit: number
  revisionsUsed: number
  revisions: Revision[]
  deliveryFiles: DeliveryFile[]
}

type Job = {
  id: string
  name: string
  status: string
  jobType: string | null
  shootDate: string | null
  deliverables: Deliverable[]
}

type Document = {
  id: string
  name: string
  docType: string
  content: string | null
  updatedAt: string
}

type PortalData = {
  client: { name: string }
  portalToken: string
  jobs: Job[]
  documents: Document[]
}

function fileKind(mime: string | null, name: string): 'video' | 'image' | 'audio' | 'pdf' | 'vimeo' | 'other' {
  const lower = (name || '').toLowerCase()
  const m = (mime || '').toLowerCase()
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm') || lower.endsWith('.m4v')) return 'video'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.avif')) return 'image'
  if (lower.endsWith('.mp3') || lower.endsWith('.wav') || lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio'
  return 'other'
}

export default function ClientPortalView({ data }: { data: PortalData }) {
  const [expandedJob, setExpandedJob] = useState<string | null>(data.jobs[0]?.id || null)

  // Mark any 'sent' files as viewed once the client opens the portal.
  useEffect(() => {
    for (const job of data.jobs) {
      for (const d of job.deliverables) {
        for (const f of d.deliveryFiles) {
          if (f.deliveryStatus === 'sent') {
            markViewed(f.id, job.id).catch(() => {})
          }
        }
      }
    }
  }, [data])

  async function handleApprove(fileId: string, jobId: string) {
    if (!confirm('Approve this file? This confirms you are happy with the delivery.')) return
    await approveDelivery(fileId, jobId)
    window.location.reload()
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <header className="py-6 px-6 flex items-center justify-center" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        <Image src="/Primary_White.svg" alt="Tui Media" width={140} height={30} style={{ height: 'auto' }} />
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8 animate-fade-in">
        <div className="text-center">
          <p className="label mb-2">Client Portal</p>
          <h1 className="text-3xl font-semibold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Welcome, {data.client.name}
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            View your projects, deliverables, and documents below.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Your Projects</h2>
          </div>

          {data.jobs.length === 0 ? (
            <div className="card text-center py-12">
              <Briefcase className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No active projects</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Your projects will appear here once they begin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.jobs.map((job) => {
                const isExpanded = expandedJob === job.id
                const allFiles = job.deliverables.flatMap((d) => d.deliveryFiles)
                return (
                  <div key={job.id} className="card">
                    <button
                      onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                      className="flex items-center gap-3 w-full text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      ) : (
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      )}
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{job.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`badge ${statusBadgeClass(job.status)}`}>{statusLabel(job.status)}</span>
                          {job.jobType && <span className="badge badge-muted">{statusLabel(job.jobType)}</span>}
                          {job.shootDate && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(job.shootDate)}</span>}
                        </div>
                      </div>
                      {allFiles.length > 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{allFiles.length} file{allFiles.length !== 1 ? 's' : ''}</span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-4 space-y-4" style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '16px' }}>
                        {job.deliverables.length === 0 ? (
                          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No deliverables uploaded yet.</p>
                        ) : (
                          job.deliverables.map((d) => (
                            <div key={d.id} className="space-y-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Film className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{d.title}</span>
                                {d.completed && <span className="badge badge-success">Complete</span>}
                                <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                                  {Math.max(d.revisionLimit - d.revisionsUsed, 0)} of {d.revisionLimit} revision{d.revisionLimit !== 1 ? 's' : ''} remaining
                                </span>
                              </div>
                              {d.description && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{d.description}</p>}

                              {d.deliveryFiles.map((f) => (
                                <FileCard key={f.id} file={f} jobId={job.id} onApprove={handleApprove} />
                              ))}

                              {d.deliveryFiles.length === 0 && (
                                <p className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>Files will appear here once uploaded.</p>
                              )}

                              {d.deliveryFiles.length > 0 && (
                                <RevisionPanel deliverable={d} />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {data.documents.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Your Documents</h2>
            </div>
            <div className="space-y-2">
              {data.documents.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} portalToken={data.portalToken} />
              ))}
            </div>
          </div>
        )}

        <div className="text-center pt-8 pb-4">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&copy; {new Date().getFullYear()} Tui Media</p>
        </div>
      </div>
    </div>
  )
}

function FileCard({ file, jobId, onApprove }: { file: DeliveryFile; jobId: string; onApprove: (fileId: string, jobId: string) => void }) {
  const kind = file.fileUrl && file.fileUrl.includes('vimeo') ? 'vimeo' : fileKind(file.mimeType, file.originalName)
  const canApprove = file.deliveryStatus === 'sent' || file.deliveryStatus === 'viewed'

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-elevated)' }}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <KindIcon kind={kind} />
        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: 240 }}>{file.originalName}</span>
        <span className={`badge ${statusBadgeClass(file.versionLabel)}`}>{statusLabel(file.versionLabel)}</span>
        <span className={`badge ${statusBadgeClass(file.deliveryStatus)}`}>{statusLabel(file.deliveryStatus)}</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{formatDate(file.createdAt)}</span>
      </div>

      {/* Preview */}
      {file.fileUrl && kind === 'vimeo' && (
        <div className="relative w-full mb-3" style={{ paddingBottom: '56.25%', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
          <iframe
            src={file.fileUrl.replace('vimeo.com/', 'player.vimeo.com/video/')}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      )}
      {file.fileUrl && kind === 'video' && (
        <video controls className="w-full rounded-lg mb-3" style={{ maxHeight: '480px', background: '#000' }}>
          <source src={file.fileUrl} type={file.mimeType || undefined} />
        </video>
      )}
      {file.fileUrl && kind === 'image' && (
        <a href={file.fileUrl} target="_blank" rel="noreferrer">
          <img src={file.fileUrl} alt={file.originalName} className="w-full rounded-lg mb-3" style={{ maxHeight: '480px', objectFit: 'contain', background: '#000' }} />
        </a>
      )}
      {file.fileUrl && kind === 'pdf' && (
        <iframe src={file.fileUrl} className="w-full rounded-lg mb-3" style={{ height: '480px', background: '#000', border: 0 }} />
      )}
      {file.fileUrl && kind === 'audio' && (
        <audio controls className="w-full mb-3">
          <source src={file.fileUrl} type={file.mimeType || undefined} />
        </audio>
      )}
      {file.fileUrl && kind === 'other' && (
        <div className="rounded-lg p-4 mb-3 flex items-center gap-3" style={{ background: 'var(--bg-surface)' }}>
          <File className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} />
          <div className="flex-1">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{file.originalName}</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Preview not available — use the download button to open this file.</p>
          </div>
        </div>
      )}

      {file.personalNote && (
        <div className="p-3 rounded-lg mb-3" style={{ background: 'var(--bg-surface)' }}>
          <p className="label mb-1">Note from Tui Media</p>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{file.personalNote}</p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {file.fileUrl && (
          <a href={file.fileUrl} target="_blank" rel="noreferrer" download={file.originalName} className="btn-secondary text-sm">
            <Download className="w-3.5 h-3.5" /> Download
          </a>
        )}
        {canApprove && (
          <button onClick={() => onApprove(file.id, jobId)} className="btn-primary text-sm">
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
        )}
      </div>
    </div>
  )
}

function RevisionPanel({ deliverable }: { deliverable: Deliverable }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(requestDeliverableRevision, undefined)
  const used = deliverable.revisionsUsed
  const limit = deliverable.revisionLimit
  const remaining = Math.max(limit - used, 0)
  const allApproved = deliverable.deliveryFiles.length > 0 && deliverable.deliveryFiles.every((f) => f.deliveryStatus === 'approved')

  useEffect(() => {
    if (state?.success) setOpen(false)
  }, [state?.success])

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-elevated)' }}>
      {deliverable.revisions.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="label">Revision history</p>
          {deliverable.revisions.map((r) => (
            <div key={r.id} className="rounded-md p-3" style={{ background: 'var(--bg-surface)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="badge badge-muted">Round {r.round}</span>
                <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{formatDate(r.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{r.request}</p>
            </div>
          ))}
        </div>
      )}

      {allApproved ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>This deliverable has been approved — no further revisions needed.</p>
      ) : remaining === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>You&apos;ve used all {limit} included revision{limit !== 1 ? 's' : ''} for this deliverable. Get in touch if you need more.</p>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="btn-secondary text-sm">
          <MessageSquare className="w-3.5 h-3.5" /> Request changes
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="deliverableId" value={deliverable.id} />
          <div>
            <label className="label mb-2 block">Round {used + 1} feedback</label>
            <textarea
              name="request"
              rows={4}
              required
              className="field-input w-full"
              placeholder="Describe the changes you'd like (e.g. trim the intro, swap shot at 0:42, lower the music...)"
            />
          </div>
          {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary text-sm">
              {pending ? 'Sending...' : 'Send feedback'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

function DocumentCard({ doc, portalToken }: { doc: Document; portalToken: string }) {
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signatureInput, setSignatureInput] = useState('')
  const [signState, signAction, signPending] = useActionState(signDocumentByClient, undefined)

  const parsed = (() => {
    if (!doc.content) return null
    try {
      const obj = JSON.parse(doc.content)
      if (obj && typeof obj === 'object' && 'template' in obj && 'form' in obj) {
        const f = (obj.form ?? {}) as Record<string, unknown>
        const get = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '')
        return {
          template: String(obj.template ?? ''),
          form: {
            clientName: get('clientName'),
            contactPerson: get('contactPerson'),
            clientEmail: get('clientEmail'),
            clientPhone: get('clientPhone'),
            businessName: get('businessName'),
            date: get('date'),
            jobDescription: get('jobDescription'),
            shootDate: get('shootDate'),
            location: get('location'),
            body: get('body'),
            clientSignature: get('clientSignature'),
            clientSignedAt: get('clientSignedAt'),
          },
        }
      }
      return null
    } catch { return null }
  })()

  const isSigned = !!parsed?.form.clientSignature
  const canSign = !!parsed && doc.docType === 'contract' && !isSigned

  useEffect(() => {
    if (signState?.success) {
      setSigning(false)
      setSignatureInput('')
      // Refresh to show the signed state and pick up updated content
      window.location.reload()
    }
  }, [signState])

  async function handleDownload() {
    if (!parsed) return
    setGenerating(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { default: TuiDocument } = await import('@/app/dashboard/documents/TuiPdfDocument')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(TuiDocument({ template: parsed.template, form: parsed.form }) as any).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc.name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation error:', err)
    }
    setGenerating(false)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-3 text-left flex-1 min-w-0">
          {expanded ? (
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          )}
          <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{doc.name}</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {statusLabel(doc.docType)} · {formatDate(doc.updatedAt)}
              {isSigned && <> · <span style={{ color: 'var(--accent)' }}>Signed {parsed?.form.clientSignedAt}</span></>}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {canSign && (
            <button onClick={() => { setExpanded(true); setSigning(true) }} className="btn-primary text-sm">
              <PenLine className="w-3.5 h-3.5" /> Sign
            </button>
          )}
          {parsed && (
            <button onClick={handleDownload} disabled={generating} className="btn-secondary text-sm">
              <Download className="w-3.5 h-3.5" /> {generating ? 'Generating...' : 'Download PDF'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3" style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '16px' }}>
          {parsed ? (
            <div className="space-y-3 text-sm" style={{ color: 'var(--text-primary)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {parsed.form.clientName && <PreviewField label="Client" value={parsed.form.clientName} />}
                {parsed.form.contactPerson && <PreviewField label="Contact" value={parsed.form.contactPerson} />}
                {parsed.form.businessName && <PreviewField label="Prepared by" value={parsed.form.businessName} />}
                {parsed.form.date && <PreviewField label="Date" value={parsed.form.date} />}
                {parsed.form.shootDate && <PreviewField label="Shoot Date" value={parsed.form.shootDate} />}
                {parsed.form.location && <PreviewField label="Location" value={parsed.form.location} />}
                {parsed.form.jobDescription && <PreviewField label="Job" value={parsed.form.jobDescription} />}
              </div>
              {parsed.form.body && (
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                  <p className="label mb-2">Content</p>
                  <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)', lineHeight: 1.7 }}>{parsed.form.body}</p>
                </div>
              )}

              {isSigned && (
                <div className="rounded-lg p-4 flex items-start gap-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
                  <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Signed by {parsed.form.clientSignature}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{parsed.form.clientSignedAt}</p>
                  </div>
                </div>
              )}

              {canSign && signing && (
                <form action={signAction} className="rounded-lg p-4 space-y-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
                  <input type="hidden" name="docId" value={doc.id} />
                  <input type="hidden" name="portalToken" value={portalToken} />
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    Type your full name to sign this {parsed.template.toLowerCase() || 'document'}. By signing, you confirm you have read and agree to the terms above.
                  </p>
                  <input
                    name="signature"
                    value={signatureInput}
                    onChange={(e) => setSignatureInput(e.target.value)}
                    placeholder="Your full name"
                    className="input w-full"
                    autoComplete="off"
                    autoFocus
                  />
                  {signatureInput && (
                    <div className="p-3 rounded-md" style={{ background: 'var(--bg-base)', border: '1px dashed var(--bg-border)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Signature preview</p>
                      <p style={{ fontFamily: 'var(--font-patrick-hand), cursive', fontSize: '28px', color: 'var(--text-primary)', lineHeight: 1 }}>{signatureInput}</p>
                    </div>
                  )}
                  {signState?.error && (
                    <p className="text-xs" style={{ color: '#f87171' }}>{signState.error}</p>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" disabled={signPending || !signatureInput.trim()} className="btn-primary text-sm">
                      <Check className="w-3.5 h-3.5" /> {signPending ? 'Signing...' : 'Sign Document'}
                    </button>
                    <button type="button" onClick={() => { setSigning(false); setSignatureInput('') }} className="btn-secondary text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Preview not available for this document.</p>
          )}
        </div>
      )}
    </div>
  )
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function KindIcon({ kind }: { kind: 'video' | 'image' | 'audio' | 'pdf' | 'vimeo' | 'other' }) {
  const color = 'var(--accent)'
  if (kind === 'image') return <ImageIcon className="w-4 h-4 shrink-0" style={{ color }} />
  if (kind === 'audio') return <Music className="w-4 h-4 shrink-0" style={{ color }} />
  if (kind === 'pdf') return <FileText className="w-4 h-4 shrink-0" style={{ color }} />
  if (kind === 'other') return <File className="w-4 h-4 shrink-0" style={{ color }} />
  return <Film className="w-4 h-4 shrink-0" style={{ color }} />
}
