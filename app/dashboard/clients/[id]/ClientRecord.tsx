'use client'

import { useActionState, useState } from 'react'
import { updateClient, deleteClient } from '@/app/actions/clients'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Briefcase, MessageSquare, StickyNote, UserCircle } from 'lucide-react'

const PIPELINE_STAGES = ['enquiry', 'discovery', 'proposal', 'contract', 'booked']
const LEAD_SOURCES = ['Referral', 'Website', 'Social Media', 'Google', 'Word of Mouth', 'Other']

type ClientData = {
  id: string
  name: string
  email: string | null
  phone: string | null
  location: string | null
  leadSource: string | null
  firstContact: string | null
  pipelineStage: string
  status: string
  lifetimeValue: number
  notes: string | null
  tags: string | null
  jobs: { id: string; name: string; jobType: string | null; status: string; quoteValue: number | null; shootDate: string | null }[]
  activities: { id: string; action: string; details: string | null; createdAt: string; job: { name: string } | null }[]
}

const TABS = [
  { key: 'details', label: 'Details', icon: UserCircle },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'history', label: 'History', icon: MessageSquare },
  { key: 'notes', label: 'Notes', icon: StickyNote },
]

export default function ClientRecord({ client, completedJobs, activeTab }: { client: ClientData; completedJobs: number; activeTab: string }) {
  const [tab, setTab] = useState(activeTab)
  const [state, action, pending] = useActionState(updateClient, undefined)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const tags: string[] = client.tags ? JSON.parse(client.tags) : []
  const pipelineIndex = PIPELINE_STAGES.indexOf(client.pipelineStage)

  async function handleDelete() {
    if (!confirm('Delete this client and all their data? This cannot be undone.')) return
    setDeleting(true)
    await deleteClient(client.id)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>{client.name}</h1>
          {client.email ? (
            <a href={`mailto:${client.email}`} className="text-sm mt-1 block" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}>{client.email}</a>
          ) : (
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>No email</p>
          )}
        </div>
        <span className={`badge ${statusBadgeClass(client.status)}`}>{statusLabel(client.status)}</span>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="stat-value">{formatNZD(client.lifetimeValue)}</div>
          <div className="stat-label">Lifetime Value</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedJobs}</div>
          <div className="stat-label">Jobs Completed</div>
        </div>
        <div className="stat-card">
          <span className={`badge ${statusBadgeClass(client.pipelineStage)}`}>{statusLabel(client.pipelineStage)}</span>
          <div className="stat-label mt-2">Pipeline Stage</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`tab ${tab === t.key ? 'active' : ''}`}>
            <span className="flex items-center gap-2">
              <t.icon className="w-4 h-4" /> {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'details' && (
        <form action={action} className="card space-y-5">
          <input type="hidden" name="clientId" value={client.id} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Name *</label>
              <input name="name" required defaultValue={client.name} className="field-input" />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input name="email" type="email" defaultValue={client.email || ''} className="field-input" />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input name="phone" defaultValue={client.phone || ''} className="field-input" />
            </div>
            <div>
              <label className="field-label">Location</label>
              <input name="location" defaultValue={client.location || ''} className="field-input" />
            </div>
            <div>
              <label className="field-label">Lead Source</label>
              <select name="leadSource" defaultValue={client.leadSource || ''} className="field-input">
                <option value="">Select...</option>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">First Contact</label>
              <input name="firstContact" type="date" defaultValue={client.firstContact?.split('T')[0] || ''} className="field-input" />
            </div>
            <div>
              <label className="field-label">Pipeline Stage</label>
              <select name="pipelineStage" defaultValue={client.pipelineStage} className="field-input">
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Status</label>
              <select name="status" defaultValue={client.status} className="field-input">
                {['lead', 'active', 'past', 'archived'].map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pipeline Progress */}
          <div>
            <label className="field-label mb-3">Pipeline Progress</label>
            <div className="flex gap-1">
              {PIPELINE_STAGES.map((s, i) => (
                <div key={s} className="flex-1">
                  <div className="h-2 rounded-full" style={{ background: i <= pipelineIndex ? 'var(--accent)' : 'var(--bg-elevated)' }} />
                  <p className="text-[10px] mt-1 text-center" style={{ color: i <= pipelineIndex ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {statusLabel(s)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <input type="hidden" name="tags" value={tags.join(', ')} />
          <input type="hidden" name="notes" value={client.notes || ''} />

          {state?.error && (
            <div className="text-sm px-4 py-3 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>{state.error}</div>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      )}

      {tab === 'jobs' && (
        <div className="card-flush">
          {client.jobs.length === 0 ? (
            <div className="empty-state">
              <Briefcase className="w-10 h-10 empty-icon" />
              <p className="empty-title">No jobs yet</p>
              <p className="empty-description">Create a job to link it to this client.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header text-left">Job</th>
                  <th className="table-header text-left hidden sm:table-cell">Type</th>
                  <th className="table-header text-left hidden md:table-cell">Shoot Date</th>
                  <th className="table-header text-right hidden sm:table-cell">Value</th>
                  <th className="table-header text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {client.jobs.map((j) => (
                  <tr key={j.id} className="table-row">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/jobs/${j.id}`} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>{j.name}</Link>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {j.jobType && <span className="badge badge-muted">{statusLabel(j.jobType)}</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(j.shootDate)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-sm text-right" style={{ color: 'var(--text-primary)' }}>{j.quoteValue ? formatNZD(j.quoteValue) : '—'}</td>
                    <td className="px-4 py-3 text-right"><span className={`badge ${statusBadgeClass(j.status)}`}>{statusLabel(j.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          {client.activities.length === 0 ? (
            <div className="empty-state">
              <MessageSquare className="w-10 h-10 empty-icon" />
              <p className="empty-title">No history yet</p>
              <p className="empty-description">Activity will appear here as you work with this client.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {client.activities.map((a) => (
                <div key={a.id} className="flex gap-3 py-3" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                  <div className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: 'var(--accent)' }} />
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{a.details || statusLabel(a.action)}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {a.job?.name ? `${a.job.name} · ` : ''}{timeAgo(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <form action={action} className="card space-y-4">
          <input type="hidden" name="clientId" value={client.id} />
          <input type="hidden" name="name" value={client.name} />
          <input type="hidden" name="status" value={client.status} />
          <input type="hidden" name="pipelineStage" value={client.pipelineStage} />
          <div>
            <label className="field-label">Tags</label>
            <input name="tags" defaultValue={tags.join(', ')} className="field-input" placeholder="Wedding, Corporate, Referral..." />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((t) => <span key={t} className="badge badge-accent">{t}</span>)}
              </div>
            )}
          </div>
          <div>
            <label className="field-label">Private Notes</label>
            <textarea name="notes" rows={6} defaultValue={client.notes || ''} className="field-input" placeholder="Notes about this client..." />
          </div>
          <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Saving...' : 'Save Notes'}</button>
        </form>
      )}

      {/* Delete */}
      <div className="pt-6" style={{ borderTop: '1px solid var(--bg-border)' }}>
        <button onClick={handleDelete} disabled={deleting} className="btn-danger">
          <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete Client'}
        </button>
      </div>
    </div>
  )
}
