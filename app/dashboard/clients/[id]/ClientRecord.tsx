'use client'

import { useActionState, useState } from 'react'
import { type ClientBacklog } from '@/lib/content-backlog'
import { updateClient, deleteClient } from '@/app/actions/clients'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { formatNZD, formatDate, statusLabel, statusBadgeClass, timeAgo, stripJobPrefix } from '@/lib/format'
import Link from 'next/link'
import { ArrowLeft, Trash2, Briefcase, MessageSquare, StickyNote, UserCircle, Copy, Check, FileText, ExternalLink, Camera, Receipt } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'
import Field from '@/components/Field'
import PortalAccountButton from './PortalAccountButton'

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
  clientCategory: string | null
  lifetimeValue: number
  monthlyRetainer: number | null
  shootsPerMonth: number | null
  invoiceDay: number | null
  notes: string | null
  tags: string | null
  portalToken: string | null
  portalInvitedAt: string | null
  documents: { id: string; name: string; docType: string; updatedAt: string }[]
  jobs: { id: string; name: string; jobType: string | null; status: string; quoteValue: number | null; shootDate: string | null }[]
  activities: { id: string; action: string; details: string | null; createdAt: string; job: { name: string } | null }[]
}

// The real month-by-month record, counted from videos actually uploaded to
// the portal.
//
// What was here before drew a tidy "Week 1 / Week 2 / Week 3" strip from
// shoots_per_month and never once checked whether a video existed. It showed
// the same confident schedule for a client two months behind as for one fully
// delivered — a fabricated schedule is worse than none, because it reads as
// information. This shows what happened, and says so when nothing did.
function RetainerSchedule({
  backlog,
  invoiceDay,
}: {
  backlog: ClientBacklog | null
  invoiceDay: number | null
}) {
  const now = new Date()

  let invoiceDate: string | null = null
  if (invoiceDay) {
    const d = new Date(now.getFullYear(), now.getMonth(), invoiceDay)
    invoiceDate = d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const months = backlog ? backlog.months.slice(-6) : []

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Content delivered
        </h3>
        {backlog && (
          <span className="text-xs" style={{ color: backlog.videosOwed > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
            {backlog.videosOwed > 0 ? `${backlog.videosOwed} owed` : 'up to date'}
          </span>
        )}
      </div>

      {months.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          No month-named jobs yet, so there is no cadence to measure against.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {months.map((m) => {
            const done = m.missing === 0 && m.expected > 0
            const colour = m.isCurrentMonth
              ? 'var(--text-secondary)'
              : !m.jobExists
                ? 'var(--danger)'
                : m.missing > 0
                  ? 'var(--warning)'
                  : 'var(--success)'
            return (
              <div key={m.month} className="flex items-center gap-3">
                <Camera className="w-3.5 h-3.5 shrink-0" style={{ color: colour }} />
                <span className="text-sm font-medium w-28 shrink-0" style={{ color: 'var(--text-primary)' }}>
                  {m.label}
                </span>
                <span className="text-sm tabular-nums" style={{ color: colour }}>
                  {m.uploaded}/{m.expected}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {m.isCurrentMonth
                    ? 'in progress'
                    : !m.jobExists
                      ? 'job never created'
                      : done
                        ? 'delivered'
                        : `${m.missing} outstanding`}
                </span>
                {m.jobId && (
                  <Link href={`/dashboard/jobs/${m.jobId}`} className="text-xs ml-auto" style={{ color: 'var(--accent)' }}>
                    Open
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 pt-2" style={{ borderTop: '1px solid var(--bg-border)' }}>
        <Receipt className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        <span className="text-sm font-medium w-28 shrink-0" style={{ color: 'var(--text-primary)' }}>Invoice</span>
        {invoiceDate ? (
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{invoiceDate}</span>
        ) : (
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No invoice day set —{' '}
            <Link href="/dashboard/settings" style={{ color: 'var(--accent)' }}>configure in Settings</Link>
          </span>
        )}
      </div>
    </div>
  )
}

const CLIENT_CATEGORIES = [
  { value: '', label: 'None' },
  { value: 'one_off', label: 'One-off' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'marketing', label: 'Marketing' },
]

const TABS = [
  { key: 'details', label: 'Details', icon: UserCircle },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'history', label: 'History', icon: MessageSquare },
  { key: 'notes', label: 'Notes', icon: StickyNote },
]

export default function ClientRecord({ client, completedJobs, activeTab, backlog }: { client: ClientData; completedJobs: number; activeTab: string; backlog: ClientBacklog | null }) {
  const [tab, setTab] = useState(activeTab)
  const [state, action, pending] = useActionState(updateClient, undefined)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)
  const toast = useToast()

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

  function handleDelete() {
    setConfirm({
      title: `Delete ${client.name}?`,
      body: 'Their jobs, notes and history go with them. There is no undo.',
      confirmLabel: 'Delete client',
      destructive: true,
      onConfirm: () => { void reallyDelete() },
    })
  }

  async function reallyDelete() {
    setDeleting(true)
    try {
      const result = await deleteClient(client.id)
      // On success, deleteClient calls redirect() which throws and never reaches here.
      if (result && 'error' in result && result.error) {
        toast({ tone: 'error', title: `Couldn't delete ${client.name}`, detail: result.error })
        setDeleting(false)
      }
    } catch (err) {
      // Re-throw redirect errors so Next.js can handle them
      if (err && typeof err === 'object' && 'digest' in err) throw err
      console.error('Delete failed:', err)
      toast({ tone: 'error', title: `Couldn't delete ${client.name}`, detail: 'Something went wrong. The console has the details.' })
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">{client.name}</h1>
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
            <button onClick={copyPortalLink} className="btn-secondary btn-sm">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Client Portal Link'}
            </button>
          )}
          <PortalAccountButton
            clientId={client.id}
            invitedAt={client.portalInvitedAt}
            hasEmail={!!client.email}
          />
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

      {/* Retainer clients only — everyone else has no cadence to measure. */}
      {client.clientCategory === 'retainer' && (
        <RetainerSchedule backlog={backlog} invoiceDay={client.invoiceDay} />
      )}

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
            <Field label="Client / Business Name *">
              <input name="name" required defaultValue={client.name} className="field-input" />
      </Field>
            <Field label="Key Contact Person">
              <input name="contactPerson" defaultValue={client.contactPerson || ''} className="field-input" placeholder="Jane Smith" />
      </Field>
            <Field label="Email">
              <input name="email" type="email" defaultValue={client.email || ''} className="field-input" />
      </Field>
            <Field label="Phone">
              <input name="phone" defaultValue={client.phone || ''} className="field-input" />
      </Field>
            <Field label="Location">
              <input name="location" defaultValue={client.location || ''} className="field-input" />
      </Field>
            <Field label="Lead Source">
              <CustomSelect
                name="leadSource"
                defaultValue={client.leadSource || ''}
                placeholder="Select..."
                options={[{ value: '', label: 'Select...' }, ...LEAD_SOURCES.map((s) => ({ value: s, label: s }))]}
              />
      </Field>
            <Field label="First Contact">
              <DatePicker name="firstContact" defaultValue={client.firstContact?.split('T')[0] || ''} className="field-input" />
      </Field>
            <Field label="Pipeline Stage">
              <CustomSelect
                name="pipelineStage"
                defaultValue={client.pipelineStage}
                options={PIPELINE_STAGES.map((s) => ({ value: s, label: statusLabel(s) }))}
              />
      </Field>
            <Field label="Status">
              <CustomSelect
                name="status"
                defaultValue={client.status}
                options={['lead', 'active', 'past', 'archived'].map((s) => ({ value: s, label: statusLabel(s) }))}
              />
      </Field>
            <Field label="Client Type">
              <CustomSelect
                name="clientCategory"
                defaultValue={client.clientCategory || ''}
                options={CLIENT_CATEGORIES}
              />
      </Field>
            <Field label="Monthly Retainer">
              <input
                name="monthlyRetainer"
                type="number"
                min="0"
                step="0.01"
                defaultValue={client.monthlyRetainer ?? ''}
                className="field-input"
                placeholder="e.g. 480 — leave blank if not a retainer"
              />
      </Field>
            <Field label="Shoots per month" hint="Used to calculate your shoot schedule">
              <input
                name="shootsPerMonth"
                type="number"
                min="1"
                max="4"
                defaultValue={client.shootsPerMonth ?? ''}
                className="field-input"
                placeholder="1–4 — retainer clients only"
              />
            </Field>
          </div>

          {/* Pipeline Progress */}
          <div>
            <label className="field-label mb-3">Pipeline Progress</label>
            <div className="flex gap-1">
              {PIPELINE_STAGES.map((s, i) => (
                <div key={s} className="flex-1">
                  <div className="h-2 rounded-full" style={{ background: i <= pipelineIndex ? 'var(--accent)' : 'var(--bg-elevated)' }} />
                  <p className="text-2xs mt-1 text-center" style={{ color: i <= pipelineIndex ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {statusLabel(s)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <input type="hidden" name="tags" value={tags.join(', ')} />
          <input type="hidden" name="notes" value={client.notes || ''} />

          {state?.error && (
            <div className="alert alert-danger">{state.error}</div>
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
                      <Link href={`/dashboard/jobs/${j.id}`} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>{stripJobPrefix(j.name)}</Link>
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
            <Link href={`/dashboard/documents?clientId=${client.id}`} className="btn-primary btn-sm">
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
            <Field label="Tags">
              <input name="tags" defaultValue={tags.join(', ')} className="field-input" placeholder="Wedding, Corporate, Referral..." />
            </Field>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((t) => <span key={t} className="badge badge-accent">{t}</span>)}
              </div>
            )}
          </div>
          <Field label="Private Notes">
            <textarea name="notes" rows={6} defaultValue={client.notes || ''} className="field-input" placeholder="Notes about this client..." />
      </Field>
          <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Saving...' : 'Save Notes'}</button>
        </form>
      )}

      {/* Delete */}
      <div className="pt-6 mt-4">
        <button onClick={handleDelete} disabled={deleting} className="btn-danger">
          <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete Client'}
        </button>
      </div>
      <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
    </div>
  )
}
