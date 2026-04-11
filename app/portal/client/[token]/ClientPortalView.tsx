'use client'

import { useState } from 'react'
import { statusLabel, statusBadgeClass, formatDate } from '@/lib/format'
import Image from 'next/image'
import { Briefcase, FileText, Film, Download, ChevronDown, ChevronRight } from 'lucide-react'

type DeliveryFile = {
  id: string
  originalName: string
  fileUrl: string | null
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

export default function ClientPortalView({ data }: { data: PortalData }) {
  const [expandedJob, setExpandedJob] = useState<string | null>(data.jobs[0]?.id || null)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="py-6 px-6 flex items-center justify-center" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        <Image src="/Primary_White.svg" alt="Tui Media" width={140} height={30} style={{ height: 'auto' }} />
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8 animate-fade-in">
        {/* Welcome */}
        <div className="text-center">
          <p className="label mb-2">Client Portal</p>
          <h1 className="text-3xl font-semibold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Welcome, {data.client.name}
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            View your projects, deliverables, and documents below.
          </p>
        </div>

        {/* Active Jobs */}
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
                                <div key={f.id} className="rounded-lg p-4" style={{ background: 'var(--bg-elevated)' }}>
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className={`badge ${statusBadgeClass(f.versionLabel)}`}>{statusLabel(f.versionLabel)}</span>
                                    <span className={`badge ${statusBadgeClass(f.deliveryStatus)}`}>{statusLabel(f.deliveryStatus)}</span>
                                    <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{formatDate(f.createdAt)}</span>
                                  </div>

                                  {/* Video/file display */}
                                  {f.fileUrl && f.fileUrl.includes('vimeo') ? (
                                    <div className="relative w-full mb-3" style={{ paddingBottom: '56.25%', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                                      <iframe
                                        src={f.fileUrl.replace('vimeo.com/', 'player.vimeo.com/video/')}
                                        className="absolute inset-0 w-full h-full"
                                        allow="autoplay; fullscreen"
                                        allowFullScreen
                                      />
                                    </div>
                                  ) : f.fileUrl && (f.fileUrl.includes('.mp4') || f.fileUrl.includes('.mov') || f.fileUrl.includes('.webm')) ? (
                                    <video controls className="w-full rounded-lg mb-3" style={{ maxHeight: '400px', background: '#000' }}>
                                      <source src={f.fileUrl} />
                                    </video>
                                  ) : f.fileUrl ? (
                                    <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{f.originalName}</p>
                                  ) : null}

                                  {f.personalNote && (
                                    <div className="p-3 rounded-lg mb-3" style={{ background: 'var(--bg-surface)' }}>
                                      <p className="label mb-1">Note from Tui Media</p>
                                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{f.personalNote}</p>
                                    </div>
                                  )}

                                  {f.downloadEnabled && f.fileUrl && (
                                    <a href={f.fileUrl} download className="btn-secondary text-sm">
                                      <Download className="w-3.5 h-3.5" /> Download
                                    </a>
                                  )}
                                </div>
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

        {/* Documents */}
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

        {/* Footer */}
        <div className="text-center pt-8 pb-4">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&copy; {new Date().getFullYear()} Tui Media</p>
        </div>
      </div>
    </div>
  )
}
