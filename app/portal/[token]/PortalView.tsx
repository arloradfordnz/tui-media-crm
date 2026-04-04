'use client'

import { useActionState, useEffect, useState } from 'react'
import { approveDelivery, requestChanges, markViewed } from '@/app/actions/portal'
import { statusLabel, statusBadgeClass, formatDate } from '@/lib/format'
import Image from 'next/image'
import { Check, RotateCcw, Download, Film, ChevronDown } from 'lucide-react'

type DeliveryFile = {
  id: string
  originalName: string
  fileUrl: string | null
  versionLabel: string
  personalNote: string | null
  downloadEnabled: boolean
  deliveryStatus: string
  createdAt: string
}

type Deliverable = {
  id: string
  title: string
  description: string | null
  deliveryFiles: DeliveryFile[]
}

type JobData = {
  id: string
  name: string
  status: string
  revisionsUsed: number
  revisionLimit: number
  client: { name: string }
  deliverables: Deliverable[]
  revisions: { id: string; round: number; request: string; createdAt: string }[]
}

export default function PortalView({ job }: { job: JobData }) {
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [revState, revAction, revPending] = useActionState(requestChanges, undefined)

  // Mark delivery files as viewed on mount
  useEffect(() => {
    for (const d of job.deliverables) {
      for (const f of d.deliveryFiles) {
        if (f.deliveryStatus === 'sent') {
          markViewed(f.id, job.id)
        }
      }
    }
  }, [job])

  const allFiles = job.deliverables.flatMap((d) => d.deliveryFiles)
  const latestFile = allFiles[0]

  async function handleApprove(fileId: string) {
    if (!confirm('Approve this delivery? This confirms you are happy with the final cut.')) return
    await approveDelivery(fileId, job.id)
    window.location.reload()
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="py-6 px-6 flex items-center justify-center" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        <Image src="/Primary_White.svg" alt="Tui Media" width={140} height={30} style={{ height: 'auto' }} />
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8 animate-fade-in">
        {/* Job title */}
        <div className="text-center">
          <p className="label mb-2">Project Delivery</p>
          <h1 className="text-3xl font-semibold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{job.name}</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Prepared for {job.client.name}</p>
        </div>

        {/* Video / Files */}
        {job.deliverables.map((d) => (
          <div key={d.id} className="card space-y-4">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.title}</h3>
            </div>
            {d.description && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{d.description}</p>}

            {d.deliveryFiles.map((f) => (
              <div key={f.id} className="space-y-3" style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '12px' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${statusBadgeClass(f.versionLabel)}`}>{statusLabel(f.versionLabel)}</span>
                  <span className={`badge ${statusBadgeClass(f.deliveryStatus)}`}>{statusLabel(f.deliveryStatus)}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{formatDate(f.createdAt)}</span>
                </div>

                {/* Video embed or file link */}
                {f.fileUrl && f.fileUrl.includes('vimeo') ? (
                  <div className="relative w-full" style={{ paddingBottom: '56.25%', background: 'var(--bg-elevated)', borderRadius: '8px', overflow: 'hidden' }}>
                    <iframe
                      src={f.fileUrl.replace('vimeo.com/', 'player.vimeo.com/video/')}
                      className="absolute inset-0 w-full h-full"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  </div>
                ) : f.fileUrl ? (
                  <video controls className="w-full rounded-lg" style={{ maxHeight: '500px', background: 'var(--bg-elevated)' }}>
                    <source src={f.fileUrl} />
                  </video>
                ) : (
                  <div className="py-6 text-center rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{f.originalName}</p>
                  </div>
                )}

                {f.personalNote && (
                  <div className="p-4 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                    <p className="label mb-1">Note from your videographer</p>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{f.personalNote}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 flex-wrap">
                  {f.deliveryStatus !== 'approved' && (
                    <button onClick={() => handleApprove(f.id)} className="btn-primary">
                      <Check className="w-4 h-4" /> Approve This Cut
                    </button>
                  )}
                  {f.deliveryStatus === 'approved' && (
                    <span className="badge badge-success text-sm py-2 px-4">Approved</span>
                  )}
                  {f.downloadEnabled && f.fileUrl && (
                    <a href={f.fileUrl} download className="btn-secondary">
                      <Download className="w-4 h-4" /> Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        {allFiles.length === 0 && (
          <div className="card text-center py-12">
            <Film className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No deliveries yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Your videographer will upload files here when they are ready for review.</p>
          </div>
        )}

        {/* Request Changes */}
        {job.revisionsUsed < job.revisionLimit && (
          <div className="card">
            <button
              onClick={() => setShowRevisionForm(!showRevisionForm)}
              className="flex items-center gap-2 text-sm font-medium w-full"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RotateCcw className="w-4 h-4" />
              Request Changes ({job.revisionsUsed}/{job.revisionLimit} revisions used)
              <ChevronDown className="w-4 h-4 ml-auto" style={{ transform: showRevisionForm ? 'rotate(180deg)' : '' }} />
            </button>
            {showRevisionForm && (
              <form action={revAction} className="mt-4 space-y-3">
                <input type="hidden" name="jobId" value={job.id} />
                <textarea
                  name="request"
                  rows={4}
                  className="field-input"
                  placeholder="Describe what changes you'd like..."
                />
                {revState?.error && (
                  <p className="text-sm" style={{ color: 'var(--danger)' }}>{revState.error}</p>
                )}
                {revState?.success && (
                  <p className="text-sm" style={{ color: 'var(--success)' }}>Your revision request has been submitted.</p>
                )}
                <button type="submit" disabled={revPending} className="btn-secondary">
                  {revPending ? 'Submitting...' : 'Submit Revision Request'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Revision History */}
        {job.revisions.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Revision History</h3>
            {job.revisions.map((r) => (
              <div key={r.id} className="py-3" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Round {r.round}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(r.createdAt)}</span>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{r.request}</p>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-8 pb-4">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&copy; {new Date().getFullYear()} Tui Media</p>
        </div>
      </div>
    </div>
  )
}
