'use client'

import { useActionState, useState, useOptimistic, useTransition, useRef } from 'react'
import { updateJob, updateJobStatus, deleteJob, toggleTask, addRevision } from '@/app/actions/jobs'
import { createProposal } from '@/app/actions/proposals'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import Link from 'next/link'
import { ArrowLeft, Trash2, CheckCircle2, Circle, Film, RotateCcw, Activity as ActivityIcon, MapPin, Calendar, FileText, Upload, Download, FileVideo, Plus, Pencil, X } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'
import JobTimeTracker, { type TimeEntry } from './JobTimeTracker'

const JOB_STATUSES = ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'delivered', 'archived']
const PHASES = ['preshoot', 'shootday', 'postproduction', 'delivery']
const PHASE_LABELS: Record<string, string> = { preshoot: 'Pre-shoot', shootday: 'Shoot Day', postproduction: 'Post-production', delivery: 'Delivery' }

type Task = { id: string; phase: string; title: string; completed: boolean }

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
  hourlyRate: number
  estimatedHours: number
  notes: string | null
  client: { id: string; name: string }
  tasks: Task[]
  deliverables: { id: string; title: string; description: string | null; completed: boolean; deliveryFiles: { id: string; originalName: string; versionLabel: string; deliveryStatus: string; createdAt: string; fileUrl: string; personalNote: string | null }[] }[]
  revisions: { id: string; round: number; request: string; status: string; createdAt: string }[]
  proposals: { id: string; status: string; token: string; totalValue: number; sentAt: string | null; respondedAt: string | null; createdAt: string }[]
  activities: { id: string; action: string; details: string | null; createdAt: string }[]
  timeEntries: TimeEntry[]
}

export default function JobRecord({ job }: { job: JobData }) {
  const [state, action, pending] = useActionState(updateJob, undefined)
  const [revState, revAction, revPending] = useActionState(addRevision, undefined)
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<'idle' | 'preparing' | 'uploading' | 'finalising'>('idle')
  type UploadedFile = { id: string; originalName: string; versionLabel: string; deliveryStatus: string; createdAt: string; fileUrl: string; personalNote: string | null }
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, UploadedFile[]>>(() => {
    const map: Record<string, UploadedFile[]> = {}
    for (const d of job.deliverables) {
      map[d.id] = d.deliveryFiles.map(f => ({ ...f, fileUrl: f.fileUrl || '', personalNote: f.personalNote || null }))
    }
    return map
  })
  const [deliverables, setDeliverables] = useState(job.deliverables)
  const [newDeliverableTitle, setNewDeliverableTitle] = useState('')
  const [editingDeliverable, setEditingDeliverable] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [revisionLimit, setRevisionLimit] = useState(job.revisionLimit)

  // Optimistic task state — updates instantly on click
  const [optimisticTasks, setOptimisticTask] = useOptimistic(
    job.tasks,
    (tasks: Task[], { id, completed }: { id: string; completed: boolean }) =>
      tasks.map((t) => (t.id === id ? { ...t, completed } : t))
  )

  function handleStatusChange(newStatus: string) {
    startTransition(() => { updateJobStatus(job.id, newStatus) })
  }

  function handleToggleTask(taskId: string, currentCompleted: boolean) {
    const newCompleted = !currentCompleted
    startTransition(async () => {
      setOptimisticTask({ id: taskId, completed: newCompleted })
      await toggleTask(taskId, newCompleted)
    })
  }

  async function handleDelete() {
    if (!confirm('Delete this job and all its data?')) return
    setDeleting(true)
    await deleteJob(job.id)
  }

  async function handleFileUpload(deliverableId: string, file: File, versionLabel: string, notes: string) {
    setUploadingFor(deliverableId)
    setUploadStage('preparing')
    setUploadProgress(0)
    let fileId: string | null = null
    try {
      // Step 1: presigned URL + pending DB row.
      const initRes = await fetch('/api/deliverables/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliverableId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          versionLabel,
          notes,
        }),
      })
      const init = await initRes.json()
      if (!initRes.ok || !init.uploadUrl) throw new Error(init.error || 'Failed to start upload')
      fileId = init.fileId as string

      // Step 2: PUT to R2 with progress tracking via XHR (fetch can't report upload progress).
      setUploadStage('uploading')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', init.uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`R2 upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.onabort = () => reject(new Error('Upload aborted'))
        xhr.send(file)
      })

      // Step 3: finalise.
      setUploadStage('finalising')
      setUploadProgress(100)
      const doneRes = await fetch('/api/deliverables/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      })
      const done = await doneRes.json()
      if (!doneRes.ok || !done.file) throw new Error(done.error || 'Failed to finalise upload')

      setUploadedFiles((prev) => ({
        ...prev,
        [deliverableId]: [...(prev[deliverableId] || []), {
          id: done.file.id,
          originalName: done.file.original_name,
          versionLabel: done.file.version_label,
          deliveryStatus: done.file.delivery_status,
          createdAt: done.file.created_at,
          fileUrl: done.file.file_url || '',
          personalNote: done.file.personal_note,
        }],
      }))
    } catch (e) {
      console.error('[upload]', e)
      alert(`Upload failed: ${(e as Error).message}`)
      if (fileId) {
        fetch('/api/deliverables/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId }),
        }).catch(() => {})
      }
    }
    setUploadingFor(null)
    setUploadStage('idle')
    setUploadProgress(0)
  }

  async function handleStatusChange_file(fileId: string, deliverableId: string, newStatus: string) {
    await fetch('/api/deliverables/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, status: newStatus }),
    })
    setUploadedFiles((prev) => ({
      ...prev,
      [deliverableId]: (prev[deliverableId] || []).map((f) =>
        f.id === fileId ? { ...f, deliveryStatus: newStatus } : f
      ),
    }))
  }

  async function handleAddDeliverable() {
    if (!newDeliverableTitle.trim()) return
    const res = await fetch('/api/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, title: newDeliverableTitle.trim() }),
    })
    const data = await res.json()
    if (data.deliverable) {
      setDeliverables((prev) => [...prev, { ...data.deliverable, deliveryFiles: [] }])
      setUploadedFiles((prev) => ({ ...prev, [data.deliverable.id]: [] }))
      setNewDeliverableTitle('')
    }
  }

  async function handleEditDeliverable(id: string) {
    if (!editTitle.trim()) return
    await fetch('/api/deliverables', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: editTitle.trim() }),
    })
    setDeliverables((prev) => prev.map((d) => d.id === id ? { ...d, title: editTitle.trim() } : d))
    setEditingDeliverable(null)
  }

  async function handleDeleteDeliverable(id: string) {
    if (!confirm('Delete this deliverable and all its files?')) return
    await fetch('/api/deliverables', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDeliverables((prev) => prev.filter((d) => d.id !== id))
  }

  async function handleRevisionLimitChange(val: number) {
    setRevisionLimit(val)
    await fetch('/api/jobs/revision-limit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, revisionLimit: val }),
    })
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
          <div style={{ minWidth: '160px' }}>
            <CustomSelect
              value={job.status}
              onChange={handleStatusChange}
              options={JOB_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
            />
          </div>
        </div>
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
            <DatePicker name="shootDate" defaultValue={job.shootDate?.split('T')[0] || ''} className="field-input" />
          </div>
          <div>
            <label className="field-label">Shoot Location</label>
            <input name="shootLocation" defaultValue={job.shootLocation || ''} className="field-input" />
          </div>
          <div>
            <label className="field-label">Quote Value (NZD)</label>
            <input name="quoteValue" type="number" step="0.01" defaultValue={job.quoteValue || ''} className="field-input" />
          </div>
          <div>
            <label className="field-label">Estimated Hours</label>
            <input name="estimatedHours" type="number" step="0.5" min={0} defaultValue={job.estimatedHours || ''} className="field-input" placeholder="e.g. 20" />
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
        {optimisticTasks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No tasks for this job.</p>
        ) : (
          PHASES.map((phase) => {
            const phaseTasks = optimisticTasks.filter((t) => t.phase === phase)
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
                    onClick={() => handleToggleTask(t.id, t.completed)}
                    className="flex items-center gap-3 py-2 w-full text-left rounded-lg px-2 -mx-2"
                    style={{ marginBottom: '2px' }}
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
        {deliverables.length === 0 ? (
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>No deliverables defined.</p>
        ) : (
          deliverables.map((d) => {
            const files = uploadedFiles[d.id] || []
            return (
              <div key={d.id} className="py-4 rounded-lg" style={{ background: 'var(--bg-elevated)', padding: '12px', marginBottom: '8px' }}>
                <div className="flex items-center gap-3 mb-3">
                  <Film className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  {editingDeliverable === d.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="field-input text-sm flex-1"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEditDeliverable(d.id); if (e.key === 'Escape') setEditingDeliverable(null) }}
                      />
                      <button onClick={() => handleEditDeliverable(d.id)} className="btn-primary text-xs" style={{ padding: '6px 12px' }}>Save</button>
                      <button onClick={() => setEditingDeliverable(null)} className="btn-icon"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <span
                        className="text-sm font-medium cursor-pointer"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => { setEditingDeliverable(d.id); setEditTitle(d.title) }}
                        title="Click to edit"
                      >
                        {d.title}
                      </span>
                      {d.completed && <span className="badge badge-success">Complete</span>}
                      <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => { setEditingDeliverable(d.id); setEditTitle(d.title) }} className="btn-icon" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteDeliverable(d.id)} className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </>
                  )}
                </div>
                {d.description && <p className="text-xs mb-3 ml-7" style={{ color: 'var(--text-secondary)' }}>{d.description}</p>}

                {/* Uploaded files list */}
                {files.length > 0 && (
                  <div className="ml-7 space-y-2 mb-3">
                    {files.map((f) => (
                      <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                        <FileVideo className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{f.originalName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`badge ${f.versionLabel === 'final_delivery' ? 'badge-success' : f.versionLabel === 'revised_cut' ? 'badge-warning' : f.versionLabel === 'raw_files' ? 'badge-muted' : 'badge-accent'}`}>
                              {statusLabel(f.versionLabel)}
                            </span>
                            <div style={{ minWidth: '120px' }}>
                              <CustomSelect
                                value={f.deliveryStatus}
                                onChange={(v) => handleStatusChange_file(f.id, d.id, v)}
                                options={[
                                  { value: 'not_sent', label: 'Not Sent' },
                                  { value: 'sent', label: 'Sent' },
                                  { value: 'viewed', label: 'Viewed' },
                                  { value: 'approved', label: 'Approved' },
                                ]}
                              />
                            </div>
                            {f.personalNote && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{f.personalNote}</span>}
                          </div>
                        </div>
                        <a href={f.fileUrl} download={f.originalName} className="btn-icon" title="Download">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload form */}
                <DeliverableUploadForm
                  deliverableId={d.id}
                  uploading={uploadingFor === d.id}
                  progress={uploadingFor === d.id ? uploadProgress : 0}
                  stage={uploadingFor === d.id ? uploadStage : 'idle'}
                  onUpload={handleFileUpload}
                />
              </div>
            )
          })
        )}

        {/* Add new deliverable */}
        <div className="flex items-center gap-3 mt-4">
          <input
            value={newDeliverableTitle}
            onChange={(e) => setNewDeliverableTitle(e.target.value)}
            placeholder="Add a new deliverable..."
            className="field-input text-sm flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDeliverable() } }}
          />
          <button onClick={handleAddDeliverable} disabled={!newDeliverableTitle.trim()} className="btn-primary text-sm">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Revision Tracker */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Revisions</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Rounds allowed:</label>
              <input
                type="number"
                min={0}
                value={revisionLimit}
                onChange={(e) => handleRevisionLimitChange(parseInt(e.target.value) || 0)}
                className="field-input text-sm"
                style={{ width: '60px', padding: '4px 8px' }}
              />
            </div>
            <span className="text-sm" style={{ color: job.revisionsUsed >= revisionLimit ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {job.revisionsUsed} of {revisionLimit} used
            </span>
          </div>
        </div>
        {job.revisions.map((r) => (
          <div key={r.id} className="py-3 rounded-lg px-3" style={{ background: 'var(--bg-elevated)', marginBottom: '4px' }}>
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Round {r.round}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(r.createdAt)}</span>
            </div>
            <p className="text-sm ml-6" style={{ color: 'var(--text-secondary)' }}>{r.request}</p>
          </div>
        ))}
        {job.revisionsUsed < revisionLimit && (
          <form action={revAction} className="mt-4 flex gap-3">
            <input type="hidden" name="jobId" value={job.id} />
            <input name="request" placeholder="Describe revision request..." className="field-input flex-1" />
            <button type="submit" disabled={revPending} className="btn-secondary">{revPending ? '...' : 'Add Revision'}</button>
          </form>
        )}
      </div>

      {/* Time Tracking */}
      <JobTimeTracker jobId={job.id} hourlyRate={job.hourlyRate} estimatedHours={job.estimatedHours} entries={job.timeEntries} />

      {/* Activity Log */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Activity</h3>
        {job.activities.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No activity recorded.</p>
        ) : (
          job.activities.map((a) => (
            <div key={a.id} className="flex items-start gap-3 py-2 rounded-lg px-2" style={{ marginBottom: '2px' }}>
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
      <div className="pt-6 mt-4">
        <button onClick={handleDelete} disabled={deleting} className="btn-danger">
          <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete Job'}
        </button>
      </div>
    </div>
  )
}

const VERSION_LABELS = [
  { value: 'first_cut', label: 'First Cut' },
  { value: 'revised_cut', label: 'Revised Cut' },
  { value: 'final_delivery', label: 'Final Delivery' },
  { value: 'raw_files', label: 'Raw Files' },
]

function DeliverableUploadForm({ deliverableId, uploading, progress, stage, onUpload }: { deliverableId: string; uploading: boolean; progress: number; stage: 'idle' | 'preparing' | 'uploading' | 'finalising'; onUpload: (id: string, file: File, version: string, notes: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [version, setVersion] = useState('first_cut')
  const [notes, setNotes] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-collapse once the upload finishes (stage returns to 'idle' after being active).
  const wasUploadingRef = useRef(false)
  if (uploading) wasUploadingRef.current = true
  else if (wasUploadingRef.current && !uploading) {
    wasUploadingRef.current = false
    // Reset local state after an upload completes.
    queueMicrotask(() => { setFile(null); setNotes(''); setExpanded(false) })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || uploading) return
    onUpload(deliverableId, file, version, notes)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="ml-7 flex items-center gap-2 text-xs py-2" style={{ color: 'var(--accent)' }}>
        <Upload className="w-3.5 h-3.5" /> Upload file
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="ml-7 p-3 rounded-lg space-y-3" style={{ background: 'var(--bg-elevated)' }}>
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="upload-drop"
        style={{
          borderColor: dragging ? 'var(--accent)' : file ? 'var(--success)' : undefined,
          background: dragging ? 'var(--accent-muted)' : undefined,
          cursor: 'pointer',
          minHeight: 72,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {file ? (
          <div className="flex items-center gap-2">
            <FileVideo className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
            <span className="text-sm truncate" style={{ color: 'var(--text-primary)', maxWidth: 240 }}>{file.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null) }}
              style={{ color: 'var(--text-tertiary)', marginLeft: 'auto' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center pointer-events-none">
            <Upload className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Drop file here or <span style={{ color: 'var(--accent)' }}>browse</span></p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Any file type</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Version</label>
          <CustomSelect value={version} onChange={setVersion} options={VERSION_LABELS} />
        </div>
        <div>
          <label className="field-label">Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="field-input text-sm" />
        </div>
      </div>
      {uploading && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>
              {stage === 'preparing' && 'Preparing upload...'}
              {stage === 'uploading' && `Uploading${file ? ` ${file.name}` : ''}`}
              {stage === 'finalising' && 'Finalising...'}
            </span>
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${stage === 'preparing' ? 2 : progress}%`,
                background: 'var(--accent)',
                transition: 'width 150ms ease-out',
              }}
            />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!file || uploading} className="btn-primary text-sm">
          <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <button type="button" disabled={uploading} onClick={() => { setExpanded(false); setFile(null) }} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  )
}
