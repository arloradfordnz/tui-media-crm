'use client'

import { useActionState, useState } from 'react'
import { updateClient, deleteClient } from '@/app/actions/clients'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo } from '@/lib/format'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Briefcase, MessageSquare, StickyNote, UserCircle, Copy, Check, FileText, ExternalLink } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'

const PIPELINE_STAGES = ['enquiry', 'discovery', 'proposal', 'negotiation', 'won']
const LEAD_SOURCES = ['Referral', 'Website', 'Social Media', 'Google', 'Word of Mouth', 'Other']

type ClientData = {
  id: string
  name: string
  contactPerson: string | null
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
  portalToken: string | null
  documents: { id: string; name: string; docType: string; updatedAt: string }[]
  jobs: { id: string; name: string; jobType: string | null; status: string; quoteValue: number | null; shootDate: string | null }[]
  activities: { id: string; action: string; details: string | null; createdAt: string; job: { name: string } | null }[]
}

const TABS = [
  { key: 'details', label: 'Details', icon: UserCircle },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'history', label: 'History', icon: MessageSquare },
  { key: 'notes', label: 'Notes', icon: StickyNote },
]

export default function ClientRecord({ client, completedJobs, activeTab }: { client: ClientData; completedJobs: number; activeTab: string }) {
  const [tab, setTab] = useState(activeTab)
  const [state, action, pending] = useActionState(updateClient, undefined)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'
  const portalLink = client.portalToken ? `${appUrl}/portal/client/${client.portalToken}` : null

  async function copyPortalLink() {
    if (!portalLink) return
    try {
      await navigator.clipboard.writeText(portalLink)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = portalLink
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tags: string[] = client.tags ? JSON.parse(client.tags) : []
  const pipelineIndex = Math.max(0, PIPELINE_STAGES.indexOf(client.pipelineStage))

  async function handleDelete() {
    if (!confirm('Delete this client and all their data? This cannot be undone.')) return
    setDeleting(true)
    try {
      const result = await deleteClient(client.id)
      // On success, deleteClient calls redirect() which throws and never reaches here.
      if (result && 'error' in result && result.error) {
        alert(`Couldn't delete client: ${result.error}`)
        setDeleting(false)
      }
    } catch (err) {
      // Re-throw redirect errors so Next.js can handle them
      if (err && typeof err === 'object' && 'digest' in err) throw err
      console.error('Delete failed:', err)
      alert('Failed to delete client. Check the console for details.')
      setDeleting(false)
    }
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
          {client.contactPerson && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Contact: {client.contactPerson}</p>
          )}
          {client.email ? (
            <a href={`mailto:${client.email}`} className="text-sm mt-1 block" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}>{client.email}</a>
          ) : (
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>No email</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {portalLink && (
            <button onClick={copyPortalLink} className="btn-secondary text-sm">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Client Portal Link'}
            </button>
          )}
          <span className={`badge ${statusBadgeClass(client.status)}`}>{statusLabel(client.status)}</span>
        </div>
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
              <label className="field-label">Client / Business Name *</label>
              <input name="name" required defaultValue={client.name} className="field-input" />
            </div>
            <div>
              <label className="field-label">Key Contact Person</label>
              <input name="contactPerson" defaultValue={client.contactPerson || ''} className="field-input" placeholder="Jane Smith" />
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
              <CustomSelect
                name="leadSource"
                defaultValue={client.leadSource || ''}
                placeholder="Select..."
                options={[{ value: '', label: 'Select...' }, ...LEAD_SOURCES.map((s) => ({ value: s, label: s }))]}
              />
            </div>
            <div>
              <label className="field-label">First Contact</label>
              <DatePicker name="firstContact" defaultValue={client.firstContact?.split('T')[0] || ''} className="field-input" />
            </div>
            <div>
              <label className="field-label">Pipeline Stage</label>
              <CustomSelect
                name="pipelineStage"
                defaultValue={client.pipelineStage}
                options={PIPELINE_STAGES.map((s) => ({ value: s, label: statusLabel(s) }))}
              />
            </div>
            <div>
              <label className="field-label">Status</label>
              <CustomSelect
                name="status"
                defaultValue={client.status}
                options={['lead', 'active', 'past', 'archived'].map((s) => ({ value: s, label: statusLabel(s) }))}
              />
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

      {tab === 'documents' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Client Documents</p>
            <Link href={`/dashboard/documents?clientId=${client.id}`} className="btn-primary text-sm">
              <FileText className="w-3.5 h-3.5" /> Create Document
            </Link>
          </div>
          {client.documents.length === 0 ? (
            <div className="empty-state">
              <FileText className="w-10 h-10 empty-icon" />
              <p className="empty-title">No documents yet</p>
              <p className="empty-description">Create a contract, invoice, or other document for this client.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {client.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-3 px-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <div>
                      <Link href={`/dashboard/documents/${d.id}`} className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{d.name}</Link>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{d.docType} · {formatDate(d.updatedAt)}</p>
                    </div>
                  </div>
                  <Link href={`/dashboard/documents/${d.id}`} className="btn-icon">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
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
                <div key={a.id} className="flex gap-3 py-3 rounded-lg px-2" style={{ marginBottom: '2px' }}>
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
          <input type="hidden" name="contactPerson" value={client.contactPerson || ''} />
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
      <div className="pt-6 mt-4">
        <button onClick={handleDelete} disabled={deleting} className="btn-danger">
          <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete Client'}
        </button>
      </div>
    </div>
  )
}
