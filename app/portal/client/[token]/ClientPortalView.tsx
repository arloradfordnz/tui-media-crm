'use client'

import { useEffect, useState } from 'react'
import { approveDelivery, markViewed } from '@/app/actions/portal'
import { statusLabel, statusBadgeClass, formatDate } from '@/lib/format'
import Image from 'next/image'
import { Briefcase, FileText, Film, Image as ImageIcon, File, Music, Download, ChevronDown, ChevronRight, Check } from 'lucide-react'

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

type Deliverable = {
  id: string
  title: string
  description: string | null
  completed: boolean
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
  updatedAt: string
}

type PortalData = {
  client: { name: string }
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
                              <div className="flex items-center gap-2">
                                <Film className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{d.title}</span>
                                {d.completed && <span className="badge badge-success">Complete</span>}
                              </div>
                              {d.description && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{d.description}</p>}

                              {d.deliveryFiles.map((f) => (
                                <FileCard key={f.id} file={f} jobId={job.id} onApprove={handleApprove} />
                              ))}

                              {d.deliveryFiles.length === 0 && (
                                <p className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>Files will appear here once uploaded.</p>
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
                <div key={doc.id} className="card flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{doc.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{statusLabel(doc.docType)} · {formatDate(doc.updatedAt)}</p>
                    </div>
                  </div>
                </div>
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

function KindIcon({ kind }: { kind: 'video' | 'image' | 'audio' | 'pdf' | 'vimeo' | 'other' }) {
  const color = 'var(--accent)'
  if (kind === 'image') return <ImageIcon className="w-4 h-4 shrink-0" style={{ color }} />
  if (kind === 'audio') return <Music className="w-4 h-4 shrink-0" style={{ color }} />
  if (kind === 'pdf') return <FileText className="w-4 h-4 shrink-0" style={{ color }} />
  if (kind === 'other') return <File className="w-4 h-4 shrink-0" style={{ color }} />
  return <Film className="w-4 h-4 shrink-0" style={{ color }} />
}
