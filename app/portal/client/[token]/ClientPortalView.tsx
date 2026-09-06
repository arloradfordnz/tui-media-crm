'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveDelivery, markViewed, markDownloaded, requestDeliverableRevision } from '@/app/actions/portal'
import { signDocumentByClient, submitDocumentFeedback } from '@/app/actions/documents'
import { renderDocBody } from '@/lib/markdown'
import { statusLabel, statusBadgeClass, formatDate } from '@/lib/format'
import Image from 'next/image'
import { Briefcase, FileText, Film, Image as ImageIcon, File, Music, Download, ChevronDown, ChevronRight, Check, MessageSquare, PenLine } from 'lucide-react'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'

type DeliveryFile = {
  id: string
  originalName: string
  fileUrl: string | null
  downloadUrl: string | null
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
  reply: string | null
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
  client: { name: string; contactPerson: string | null }
  portalToken: string
  jobs: Job[]
  documents: Document[]
}

// The client's view of where a job is up to.
//
// The portal was rendering the internal pipeline status verbatim, so clients
// saw "Pre-production" and "Shoot Day" — scheduling states that describe how
// Tui Media organises its own week, not anything the client can act on. Worse,
// several of them came through statusBadgeClass in amber, which reads as a
// warning about their project when nothing is wrong.
//
// This collapses the pipeline into the four things a client actually cares
// about: is it booked, is it being made, does it need me, is it done. The one
// state that is genuinely about them — review — says so in words that ask.
const CLIENT_STATUS: Record<string, { label: string; badge: string }> = {
  enquiry:       { label: 'Getting started', badge: 'badge-muted' },
  discovery:     { label: 'Getting started', badge: 'badge-muted' },
  proposal:      { label: 'Getting started', badge: 'badge-muted' },
  negotiation:   { label: 'Getting started', badge: 'badge-muted' },
  contract:      { label: 'Getting started', badge: 'badge-muted' },
  booked:        { label: 'Booked', badge: 'badge-accent' },
  preproduction: { label: 'In production', badge: 'badge-accent' },
  shootday:      { label: 'In production', badge: 'badge-accent' },
  editing:       { label: 'In production', badge: 'badge-accent' },
  review:        { label: 'Ready for your review', badge: 'badge-warning' },
  approved:      { label: 'Approved', badge: 'badge-success' },
  delivered:     { label: 'Delivered', badge: 'badge-success' },
  archived:      { label: 'Complete', badge: 'badge-muted' },
}

function clientStatus(status: string): { label: string; badge: string } {
  // An unmapped status must never fall through to the raw internal string —
  // that is exactly how "shootday" would reach a client.
  return CLIENT_STATUS[status] ?? { label: 'In progress', badge: 'badge-muted' }
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
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)
  const router = useRouter()
  const [expandedJob, setExpandedJob] = useState<string | null>(data.jobs[0]?.id || null)

  // Mark any 'sent' files as viewed once the client opens the portal.
  useEffect(() => {
    for (const job of data.jobs) {
      for (const d of job.deliverables) {
        for (const f of d.deliveryFiles) {
          if (f.deliveryStatus === 'sent') {
            markViewed(f.id, job.id, data.portalToken).catch(() => {})
          }
        }
      }
    }
  }, [data])

  // Approving is the client saying "this is finished" — it belongs in a sheet
  // that looks like Tui Media, not a browser dialog stamped with the domain.
  function handleApprove(fileId: string, jobId: string) {
    setConfirm({
      title: 'Approve this delivery?',
      body: 'This lets us know you are happy with it and the work is signed off. If you would like changes instead, use Request a revision.',
      confirmLabel: 'Approve',
      onConfirm: async () => {
        await approveDelivery(fileId, jobId, data.portalToken)
        // Re-fetch the server component data in place — no full page flash.
        router.refresh()
      },
    })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <header className="py-5 px-6 flex items-center justify-center">
        <Image className="logo-light" src="/Primary_Black.svg" alt="Tui Media" width={130} height={27} />
        <Image className="logo-dark" src="/Primary_White.svg" alt="Tui Media" width={130} height={27} />
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6 animate-fade-in">
        {/* Hero greeting */}
        <div className="py-2">
          <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>Client Portal</p>
          <h1 className="text-3xl md:text-4xl font-semibold" style={{ letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text-primary)' }}>
            Kia ora, {data.client.contactPerson || data.client.name}
          </h1>
          <p className="text-sm md:text-base mt-2 max-w-md" style={{ color: 'var(--text-secondary)' }}>
            View your projects, deliverables, and documents below.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="stat-icon-bubble bubble-sm">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Your Projects</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{data.jobs.length} project{data.jobs.length === 1 ? '' : 's'}</p>
            </div>
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
                          <span className={`badge ${clientStatus(job.status).badge}`}>{clientStatus(job.status).label}</span>
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
                                <FileCard key={f.id} file={f} jobId={job.id} portalToken={data.portalToken} onApprove={handleApprove} />
                              ))}

                              {d.deliveryFiles.length === 0 && (
                                <p className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>Files will appear here once uploaded.</p>
                              )}

                              {d.deliveryFiles.length > 0 && (
                                <RevisionPanel deliverable={d} portalToken={data.portalToken} />
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
            <div className="flex items-center gap-3 mb-4">
              <div className="stat-icon-bubble bubble-sm">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Your Documents</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{data.documents.length} document{data.documents.length === 1 ? '' : 's'}</p>
              </div>
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

      <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
      </div>
    </div>
  )
}

function FileCard({ file, jobId, portalToken, onApprove }: { file: DeliveryFile; jobId: string; portalToken: string; onApprove: (fileId: string, jobId: string) => void }) {
  const kind = file.fileUrl && file.fileUrl.includes('vimeo') ? 'vimeo' : fileKind(file.mimeType, file.originalName)
  const canApprove = file.deliveryStatus === 'sent' || file.deliveryStatus === 'viewed'

  function handleDownload() {
    // downloadUrl is a presigned R2 URL with Content-Disposition: attachment, so
    // the browser saves the file natively. Navigating to it streams straight to
    // disk — no fetch()/blob(), which used to buffer multi-GB videos in memory
    // and stall phones.
    const url = file.downloadUrl || file.fileUrl
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    markDownloaded(file.id, jobId, portalToken).catch(() => {})
  }

  return (
    <div className="box-inset-lg">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <KindIcon kind={kind} />
        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: 240 }}>{file.originalName}</span>
        <span className={`badge ${statusBadgeClass(file.versionLabel)}`}>{statusLabel(file.versionLabel)}</span>
        <span className={`badge ${statusBadgeClass(file.deliveryStatus)}`}>{statusLabel(file.deliveryStatus)}</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{formatDate(file.createdAt)}</span>
      </div>

      {/* Preview */}
      {file.fileUrl && kind === 'vimeo' && (
        <div className="media-band">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={file.fileUrl.replace('vimeo.com/', 'player.vimeo.com/video/')}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
      {file.fileUrl && kind === 'video' && (
        <div className="media-band">
          {/* playsInline is the whole ballgame on iOS: without it Safari yanks
              the client out of the page into its own fullscreen player the
              moment they hit play, and they land back on a scroll position
              that is not where they left. preload="metadata" pulls the first
              frame so the player shows the video rather than a black rectangle
              — the closest thing to a poster frame without storing one. */}
          <video
            controls
            playsInline
            preload="metadata"
            className="w-full"
            style={{ maxHeight: '70vh', background: '#060D1A', display: 'block' }}
          >
            <source src={file.fileUrl} type={file.mimeType || undefined} />
          </video>
        </div>
      )}
      {file.fileUrl && kind === 'image' && (
        <a href={file.fileUrl} target="_blank" rel="noreferrer" className="media-band">
          {/* Deliberately a plain <img>, not next/image. This is the client's
              delivered file on R2: routing it through the image optimiser
              would re-encode the very thing they came to look at, and spend a
              transform from the plan's quota, for a photo that is already
              sized and already on a CDN. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.fileUrl} alt={file.originalName} className="w-full" style={{ maxHeight: '70vh', objectFit: 'contain', background: '#060D1A', display: 'block' }} />
        </a>
      )}
      {file.fileUrl && kind === 'pdf' && (
        <div className="media-band">
          <iframe src={file.fileUrl} className="w-full" style={{ height: '70vh', background: '#060D1A', border: 0, display: 'block' }} />
        </div>
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
        {(file.downloadUrl || file.fileUrl) && (
          <button onClick={handleDownload} className="btn-secondary btn-sm">
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        )}
        {canApprove && (
          <button onClick={() => onApprove(file.id, jobId)} className="btn-primary btn-sm">
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
        )}
      </div>
    </div>
  )
}

function RevisionPanel({ deliverable, portalToken }: { deliverable: Deliverable; portalToken: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(requestDeliverableRevision, undefined)
  const used = deliverable.revisionsUsed
  const limit = deliverable.revisionLimit
  const remaining = Math.max(limit - used, 0)
  const allApproved = deliverable.deliveryFiles.length > 0 && deliverable.deliveryFiles.every((f) => f.deliveryStatus === 'approved')

  // Collapse the form once the action succeeds. Compared against the previous
  // result during render rather than in an effect, which painted the still-open
  // form for a frame and tripped react-hooks/set-state-in-effect.
  const [lastState, setLastState] = useState(state)
  if (state !== lastState) {
    setLastState(state)
    if (state?.success) setOpen(false)
  }

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
              {r.reply && (
                <div className="mt-2 p-2.5 rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                  <p className="label mb-1">Reply from Tui Media</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{r.reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {allApproved ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>This deliverable has been approved — no further revisions needed.</p>
      ) : remaining === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>You&apos;ve used all {limit} included revision{limit !== 1 ? 's' : ''} for this deliverable. Get in touch if you need more.</p>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="btn-secondary btn-sm">
          <MessageSquare className="w-3.5 h-3.5" /> Request changes
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="deliverableId" value={deliverable.id} />
          <input type="hidden" name="portalToken" value={portalToken} />
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
            <button type="submit" disabled={pending} className="btn-primary btn-sm">
              {pending ? 'Sending...' : 'Send feedback'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

function DocumentCard({ doc, portalToken }: { doc: Document; portalToken: string }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signatureInput, setSignatureInput] = useState('')
  const [signState, signAction, signPending] = useActionState(signDocumentByClient, undefined)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackInput, setFeedbackInput] = useState('')
  const [fbState, fbAction, fbPending] = useActionState(submitDocumentFeedback, undefined)

  useEffect(() => {
    if (fbState?.success) {
      setFeedbackInput('')
      setFeedbackOpen(false)
      router.refresh()
    }
  }, [fbState, router])

  const parsed = (() => {
    if (!doc.content) return null
    try {
      const obj = JSON.parse(doc.content)
      // Accept docs that have a form even if `template` was lost — older saves
      // and bug-affected rows may be missing it. We default the template so
      // signed state still renders correctly.
      if (obj && typeof obj === 'object' && 'form' in obj) {
        const f = (obj.form ?? {}) as Record<string, unknown>
        const get = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '')
        const rawFeedback = Array.isArray((obj as { feedback?: unknown }).feedback)
          ? ((obj as { feedback: unknown[] }).feedback as Array<Record<string, unknown>>)
          : []
        const feedback = rawFeedback.map((r) => ({
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
            businessName: get('businessName'),
            date: get('date'),
            jobDescription: get('jobDescription'),
            shootDate: get('shootDate'),
            location: get('location'),
            body: get('body'),
            clientSignature: get('clientSignature'),
            clientSignedAtISO: get('clientSignedAtISO'),
            clientSignedIp: get('clientSignedIp'),
            clientSignedAt: get('clientSignedAt'),
            documentNumber: get('documentNumber'),
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
      router.refresh()
    }
  }, [signState, router])

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
            <button onClick={() => { setExpanded(true); setSigning(true) }} className="btn-primary btn-sm">
              <PenLine className="w-3.5 h-3.5" /> Sign
            </button>
          )}
          {parsed && (
            <button onClick={handleDownload} disabled={generating} className="btn-secondary btn-sm">
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
                  <div
                    className="whitespace-pre-wrap text-sm"
                    style={{ color: 'var(--text-primary)', lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: renderDocBody(parsed.form.body) }}
                  />
                </div>
              )}

              {isSigned && (
                <div className="rounded-lg p-4 flex items-start gap-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
                  <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Signed by {parsed.form.clientSignature}</p>
                    {/* The audit trail is the thing that makes this defensible,
                        so it is shown rather than merely stored: who, exactly
                        when (to the minute, with timezone), and from where. */}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {parsed.form.clientSignedAtISO
                        ? new Date(parsed.form.clientSignedAtISO).toLocaleString('en-NZ', {
                            day: 'numeric', month: 'long', year: 'numeric',
                            hour: 'numeric', minute: '2-digit',
                            timeZone: 'Pacific/Auckland', timeZoneName: 'short',
                          })
                        : parsed.form.clientSignedAt}
                    </p>
                    {parsed.form.clientSignedIp && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        IP {parsed.form.clientSignedIp}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {parsed.feedback && parsed.feedback.length > 0 && (
                <div className="space-y-2">
                  <p className="label">Your feedback</p>
                  {parsed.feedback.map((fb, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fb.author}</span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{formatDate(fb.createdAt)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{fb.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {!feedbackOpen ? (
                <button onClick={() => setFeedbackOpen(true)} className="btn-secondary btn-sm">
                  <MessageSquare className="w-3.5 h-3.5" /> Leave feedback
                </button>
              ) : (
                <form action={fbAction} className="rounded-lg p-4 space-y-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
                  <input type="hidden" name="docId" value={doc.id} />
                  <input type="hidden" name="portalToken" value={portalToken} />
                  <label className="label block">Your feedback</label>
                  <textarea
                    name="message"
                    rows={4}
                    required
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                    className="field-input w-full"
                    placeholder="Questions, suggested changes, or anything else you'd like to flag about this document..."
                  />
                  {fbState?.error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{fbState.error}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={fbPending || !feedbackInput.trim()} className="btn-primary btn-sm">
                      {fbPending ? 'Sending...' : 'Send feedback'}
                    </button>
                    <button type="button" onClick={() => { setFeedbackOpen(false); setFeedbackInput('') }} className="btn-secondary btn-sm">Cancel</button>
                  </div>
                </form>
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
                    <div className="signature-preview">
                      {/* Rendered as a typed name on a signing rule, not in a
                          handwriting face. A script font imitating ink is the
                          weaker artefact of the two: it invites the question
                          "did they actually write that", and the honest answer
                          is no — they typed it. A typed name that looks typed,
                          sitting above a printed audit trail, is what actually
                          holds up. */}
                      <p className="signature-name">{signatureInput}</p>
                      <p className="signature-rule-label">Signature</p>
                    </div>
                  )}
                  {signState?.error && (
                    <p className="text-xs" style={{ color: 'var(--danger)' }}>{signState.error}</p>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" disabled={signPending || !signatureInput.trim()} className="btn-primary btn-sm">
                      <Check className="w-3.5 h-3.5" /> {signPending ? 'Signing...' : 'Sign Document'}
                    </button>
                    <button type="button" onClick={() => { setSigning(false); setSignatureInput('') }} className="btn-secondary btn-sm">
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
