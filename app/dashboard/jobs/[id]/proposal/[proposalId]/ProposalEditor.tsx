'use client'

import { useActionState, useState, useTransition } from 'react'
import { updateProposal, sendProposal } from '@/app/actions/proposals'
import { formatNZD, formatDate, statusLabel, statusBadgeClass } from '@/lib/format'
import Link from 'next/link'
import { ArrowLeft, Send, Eye, Plus, Trash2, Copy } from 'lucide-react'

type ServiceLine = { description: string; amount: number }

type ProposalData = {
  id: string
  jobId: string
  token: string
  status: string
  coverNote: string | null
  services: string
  inclusions: string | null
  paymentTerms: string
  totalValue: number
  sentAt: string | null
  respondedAt: string | null
  createdAt: string
  job: {
    id: string
    name: string
    jobType: string | null
    shootDate: string | null
    shootLocation: string | null
    client: { id: string; name: string }
  }
}

export default function ProposalEditor({ proposal }: { proposal: ProposalData }) {
  const [state, action, pending] = useActionState(updateProposal, undefined)
  const [isPending, startTransition] = useTransition()
  const [services, setServices] = useState<ServiceLine[]>(() => {
    try { return JSON.parse(proposal.services) } catch { return [] }
  })
  const [copied, setCopied] = useState(false)

  const isDraft = proposal.status === 'draft'
  const proposalUrl = typeof window !== 'undefined' ? `${window.location.origin}/proposal/${proposal.token}` : `/proposal/${proposal.token}`
  const total = services.reduce((sum, s) => sum + (s.amount || 0), 0)

  function addServiceLine() {
    setServices([...services, { description: '', amount: 0 }])
  }

  function removeServiceLine(index: number) {
    setServices(services.filter((_, i) => i !== index))
  }

  function updateServiceLine(index: number, field: keyof ServiceLine, value: string) {
    const updated = [...services]
    if (field === 'amount') {
      updated[index] = { ...updated[index], amount: Number(value) || 0 }
    } else {
      updated[index] = { ...updated[index], description: value }
    }
    setServices(updated)
  }

  function handleSend() {
    if (!confirm('Send this proposal to the client? They will receive a link to view and respond.')) return
    startTransition(() => { sendProposal(proposal.id) })
  }

  function copyLink() {
    navigator.clipboard.writeText(proposalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href={`/dashboard/jobs/${proposal.jobId}`} className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Job
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Proposal</h1>
          <div className="flex items-center gap-3 mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span>{proposal.job.name}</span>
            <span>&middot;</span>
            <Link href={`/dashboard/clients/${proposal.job.client.id}`} style={{ color: 'var(--accent)' }}>{proposal.job.client.name}</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${statusBadgeClass(proposal.status)}`}>{statusLabel(proposal.status)}</span>
          {isDraft && (
            <button onClick={handleSend} disabled={isPending} className="btn-primary text-sm">
              <Send className="w-3.5 h-3.5" /> {isPending ? 'Sending...' : 'Send to Client'}
            </button>
          )}
        </div>
      </div>

      {/* Share Link (shown after sent) */}
      {proposal.status !== 'draft' && (
        <div className="card flex items-center gap-3">
          <span className="label shrink-0">Proposal Link</span>
          <code className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{proposalUrl}</code>
          <button onClick={copyLink} className="btn-secondary text-sm">
            <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <a href={proposalUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
            <Eye className="w-3.5 h-3.5" /> Preview
          </a>
        </div>
      )}

      {/* Editor Form */}
      <form action={action} className="space-y-6">
        <input type="hidden" name="proposalId" value={proposal.id} />
        <input type="hidden" name="services" value={JSON.stringify(services)} />
        <input type="hidden" name="totalValue" value={total} />

        {/* Cover Note */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cover Note</h3>
          <textarea
            name="coverNote"
            rows={4}
            defaultValue={proposal.coverNote || ''}
            className="field-input"
            disabled={!isDraft}
            placeholder="A personal message to the client..."
          />
        </div>

        {/* Services & Pricing */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Services &amp; Pricing</h3>
          <div className="space-y-3">
            {services.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  value={s.description}
                  onChange={(e) => updateServiceLine(i, 'description', e.target.value)}
                  className="field-input flex-1"
                  placeholder="Service description"
                  disabled={!isDraft}
                />
                <div className="relative" style={{ width: '140px' }}>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-tertiary)' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={s.amount || ''}
                    onChange={(e) => updateServiceLine(i, 'amount', e.target.value)}
                    className="field-input pl-7"
                    placeholder="0.00"
                    disabled={!isDraft}
                  />
                </div>
                {isDraft && (
                  <button type="button" onClick={() => removeServiceLine(i)} className="btn-icon" style={{ color: 'var(--danger)' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isDraft && (
            <button type="button" onClick={addServiceLine} className="btn-secondary text-sm">
              <Plus className="w-3.5 h-3.5" /> Add Service Line
            </button>
          )}
          <div className="flex justify-end pt-3" style={{ borderTop: '1px solid var(--bg-border)' }}>
            <div className="text-right">
              <span className="label">Total</span>
              <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{formatNZD(total)}</p>
            </div>
          </div>
        </div>

        {/* What's Included */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>What&apos;s Included</h3>
          <textarea
            name="inclusions"
            rows={5}
            defaultValue={proposal.inclusions || ''}
            className="field-input"
            disabled={!isDraft}
            placeholder="One item per line..."
          />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Each line will display as a bullet point in the proposal.</p>
        </div>

        {/* Payment Terms */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Payment Terms</h3>
          <textarea
            name="paymentTerms"
            rows={3}
            defaultValue={proposal.paymentTerms}
            className="field-input"
            disabled={!isDraft}
          />
        </div>

        {/* Save / Status */}
        {state?.error && <div className="text-sm px-4 py-3 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>{state.error}</div>}
        {state?.success && <div className="text-sm px-4 py-3 rounded-lg" style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--success)' }}>Proposal saved.</div>}

        {isDraft && (
          <div className="flex gap-3">
            <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Saving...' : 'Save Proposal'}</button>
            <a href={proposalUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <Eye className="w-4 h-4" /> Preview
            </a>
          </div>
        )}
      </form>

      {/* Response Info */}
      {proposal.respondedAt && (
        <div className="card">
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Client {proposal.status === 'accepted' ? 'accepted' : 'declined'} this proposal on {formatDate(proposal.respondedAt)}.
          </p>
        </div>
      )}
    </div>
  )
}
