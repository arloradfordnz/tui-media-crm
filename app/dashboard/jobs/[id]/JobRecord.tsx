'use client'

import { useActionState, useState, useTransition } from 'react'
import { updateJob, updateJobStatus, deleteJob, toggleTask, addRevision } from '@/app/actions/jobs'
import { createProposal } from '@/app/actions/proposals'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import Link from 'next/link'
import { ArrowLeft, Trash2, CheckCircle2, Circle, Film, RotateCcw, Activity as ActivityIcon, MapPin, Calendar, Copy, FileText } from 'lucide-react'

const JOB_STATUSES = ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'delivered', 'archived']
const PHASES = ['preshoot', 'shootday', 'postproduction', 'delivery']
const PHASE_LABELS: Record<string, string> = { preshoot: 'Pre-shoot', shootday: 'Shoot Day', postproduction: 'Post-production', delivery: 'Delivery' }

type JobData = {
  id: string
  name: string
  jobType: string | null
  status: string
  shootDate: string | null
  shootLocation: string | null
  quoteValue: number | null
  revisionLimit: number
  revisionsUsed: number
  notes: string | null
  portalToken: string
  client: { id: string; name: string }
  tasks: { id: string; phase: string; title: string; completed: boolean }[]
  deliverables: { id: string; title: string; description: string | null; completed: boolean; deliveryFiles: { id: string; originalName: string; versionLabel: string; deliveryStatus: string; createdAt: string }[] }[]
  revisions: { id: string; round: number; request: string; status: string; createdAt: string }[]
  proposals: { id: string; status: string; token: string; totalValue: number; sentAt: string | null; respondedAt: string | null; createdAt: string }[]
  activities: { id: string; action: string; details: string | null; createdAt: string }[]
}

export default function JobRecord({ job }: { job: JobData }) {
  const [state, action, pending] = useActionState(updateJob, undefined)
  const [revState, revAction, revPending] = useActionState(addRevision, undefined)
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuimedia.co.nz'
  const portalUrl = `${baseUrl}/portal/${job.portalToken}`

  function handleStatusChange(newStatus: string) {
    startTransition(() => { updateJobStatus(job.id, newStatus) })
  }

  function handleToggleTask(taskId: string, completed: boolean) {
    startTransition(() => { toggleTask(taskId, completed) })
  }

  async function handleDelete() {
    if (!confirm('Delete this job and all its data?')) return
    setDeleting(true)
    await deleteJob(job.id)
  }

  function copyPortalLink() {
    navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/dashboard/jobs" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>{job.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Link href={`/dashboard/clients/${job.client.id}`} style={{ color: 'var(--accent)' }}>{job.client.name}</Link>
            {job.shootDate && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(job.shootDate)}</span>}
            {job.shootLocation && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.shootLocation}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {job.quoteValue && <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{formatNZD(job.quoteValue)}</span>}
          <select value={job.status} onChange={(e) => handleStatusChange(e.target.value)} className="field-input" style={{ width: 'auto' }}>
            {JOB_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
      </div>

      {/* Portal Link */}
      <div className="card flex items-center gap-3">
        <span className="label shrink-0">Client Portal</span>
        <code className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{portalUrl}</code>
        <button onClick={copyPortalLink} className="btn-secondary text-sm">
          <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      {/* Proposal */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Proposal</h3>
          {job.proposals.length > 0 && (
            <span className={`badge ${statusBadgeClass(job.proposals[0].status)}`}>{statusLabel(job.proposals[0].status)}</span>
          )}
        </div>
        {job.proposals.length > 0 ? (
          <div className="space-y-3">
            {job.proposals.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatNZD(p.totalValue)}</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Created {formatDate(p.createdAt)}
                    {p.sentAt && ` · Sent ${formatDate(p.sentAt)}`}
                    {p.respondedAt && ` · Responded ${formatDate(p.respondedAt)}`}
                  </p>
                </div>
                <Link href={`/dashboard/jobs/${job.id}/proposal/${p.id}`} className="btn-secondary text-sm">
                  <FileText className="w-3.5 h-3.5" /> {p.status === 'draft' ? 'Edit Proposal' : 'View Proposal'}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No proposal created yet.</p>
            <form action={async () => { await createProposal(job.id) }}>
              <button type="submit" className="btn-primary text-sm">
                <FileText className="w-3.5 h-3.5" /> Create Proposal
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Job Type & Notes */}
      <form action={action} className="card space-y-4">
        <input type="hidden" name="jobId" value={job.id} />
        <input type="hidden" name="status" value={job.status} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Job Name</label>
            <input name="name" defaultValue={job.name} className="field-input" />
          </div>
          <div>
            <label className="field-label">Shoot Date</label>
            <input name="shootDate" type="date" defaultValue={job.shootDate?.split('T')[0] || ''} className="field-input" />
          </div>
          <div>
            <label className="field-label">Shoot Location</label>
            <input name="shootLocation" defaultValue={job.shootLocation || ''} className="field-input" />
          </div>
          <div>
            <label className="field-label">Quote Value (NZD)</label>
            <input name="quoteValue" type="number" step="0.01" defaultValue={job.quoteValue || ''} className="field-input" />
          </div>
        </div>
        <div>
          <label className="field-label">Notes</label>
          <textarea name="notes" rows={3} defaultValue={job.notes || ''} className="field-input" />
        </div>
        {state?.error && <div className="text-sm px-4 py-3 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>{state.error}</div>}
        <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Saving...' : 'Save Changes'}</button>
      </form>

      {/* Task Checklist */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Task Checklist</h3>
        {job.tasks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No tasks for this job.</p>
        ) : (
          PHASES.map((phase) => {
            const phaseTasks = job.tasks.filter((t) => t.phase === phase)
            if (phaseTasks.length === 0) return null
            const done = phaseTasks.filter((t) => t.completed).length
            return (
              <div key={phase} className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="label">{PHASE_LABELS[phase]}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{done}/{phaseTasks.length}</span>
                </div>
                {phaseTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleToggleTask(t.id, !t.completed)}
                    className="flex items-center gap-3 py-2 w-full text-left"
                    style={{ borderBottom: '1px solid var(--bg-border)' }}
                  >
                    {t.completed
                      ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
                      : <Circle className="w-5 h-5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    }
                    <span className="text-sm" style={{ color: t.completed ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: t.completed ? 'line-through' : 'none' }}>
                      {t.title}
                    </span>
                  </button>
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Deliverables */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Deliverables</h3>
        {job.deliverables.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No deliverables defined.</p>
        ) : (
          job.deliverables.map((d) => (
            <div key={d.id} className="py-3" style={{ borderBottom: '1px solid var(--bg-border)' }}>
              <div className="flex items-center gap-3">
                <Film className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{d.title}</span>
                {d.completed && <span className="badge badge-success">Complete</span>}
              </div>
              {d.description && <p className="text-xs mt-1 ml-7" style={{ color: 'var(--text-secondary)' }}>{d.description}</p>}
              {d.deliveryFiles.length > 0 && (
                <div className="ml-7 mt-2 space-y-1">
                  {d.deliveryFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>{f.originalName}</span>
                      <span className={`badge ${statusBadgeClass(f.versionLabel)}`}>{statusLabel(f.versionLabel)}</span>
                      <span className={`badge ${statusBadgeClass(f.deliveryStatus)}`}>{statusLabel(f.deliveryStatus)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Revision Tracker */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Revisions</h3>
          <span className="text-sm" style={{ color: job.revisionsUsed >= job.revisionLimit ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {job.revisionsUsed} of {job.revisionLimit} used
          </span>
        </div>
        {job.revisions.map((r) => (
          <div key={r.id} className="py-3" style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Round {r.round}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(r.createdAt)}</span>
            </div>
            <p className="text-sm ml-6" style={{ color: 'var(--text-secondary)' }}>{r.request}</p>
          </div>
        ))}
        {job.revisionsUsed < job.revisionLimit && (
          <form action={revAction} className="mt-4 flex gap-3">
            <input type="hidden" name="jobId" value={job.id} />
            <input name="request" placeholder="Describe revision request..." className="field-input flex-1" />
            <button type="submit" disabled={revPending} className="btn-secondary">{revPending ? '...' : 'Add Revision'}</button>
          </form>
        )}
      </div>

      {/* Activity Log */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Activity</h3>
        {job.activities.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No activity recorded.</p>
        ) : (
          job.activities.map((a) => (
            <div key={a.id} className="flex items-start gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
              <ActivityIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{a.details || statusLabel(a.action)}</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(a.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete */}
      <div className="pt-6" style={{ borderTop: '1px solid var(--bg-border)' }}>
        <button onClick={handleDelete} disabled={deleting} className="btn-danger">
          <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete Job'}
        </button>
      </div>
    </div>
  )
}
