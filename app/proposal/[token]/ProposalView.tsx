'use client'

import { useState, useTransition } from 'react'
import { acceptProposal, declineProposal } from '@/app/actions/proposals'
import { formatNZD, formatDate, statusLabel } from '@/lib/format'
import Image from 'next/image'
import { Check, X, MapPin, Calendar, CheckCircle2 } from 'lucide-react'

type ServiceLine = { description: string; amount: number }

type ProposalData = {
  id: string
  token: string
  status: string
  coverNote: string | null
  services: string
  inclusions: string | null
  paymentTerms: string
  totalValue: number
  sentAt: string | null
  respondedAt: string | null
  job: {
    name: string
    jobType: string | null
    shootDate: string | null
    shootLocation: string | null
    client: { name: string }
  }
}

export default function ProposalView({ proposal }: { proposal: ProposalData }) {
  const [isPending, startTransition] = useTransition()
  const [responded, setResponded] = useState(proposal.status === 'accepted' || proposal.status === 'declined')

  let services: ServiceLine[] = []
  try { services = JSON.parse(proposal.services) } catch { /* empty */ }

  const inclusionLines = proposal.inclusions?.split('\n').filter((l) => l.trim()) || []

  function handleAccept() {
    if (!confirm('Accept this proposal? This confirms you would like to proceed with the project.')) return
    startTransition(async () => {
      await acceptProposal(proposal.token)
      setResponded(true)
      window.location.reload()
    })
  }

  function handleDecline() {
    if (!confirm('Decline this proposal? You can contact us to discuss alternative options.')) return
    startTransition(async () => {
      await declineProposal(proposal.token)
      setResponded(true)
      window.location.reload()
    })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="py-6 px-6 flex items-center justify-center" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        <Image src="/Primary_White.svg" alt="Tui Media" width={140} height={30} style={{ height: 'auto' }} />
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8 animate-fade-in">
        {/* Cover Section */}
        <div className="text-center space-y-3">
          <p className="label">Proposal</p>
          <h1 className="text-3xl font-semibold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{proposal.job.name}</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Prepared for {proposal.job.client.name}</p>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {proposal.job.shootDate && (
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(proposal.job.shootDate)}</span>
            )}
            {proposal.job.shootLocation && (
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {proposal.job.shootLocation}</span>
            )}
            {proposal.job.jobType && (
              <span>{statusLabel(proposal.job.jobType)}</span>
            )}
          </div>
        </div>

        {/* Status Banner */}
        {proposal.status === 'accepted' && (
          <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>This proposal has been accepted. Thank you!</p>
          </div>
        )}
        {proposal.status === 'declined' && (
          <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>This proposal has been declined.</p>
          </div>
        )}

        {/* Cover Note */}
        {proposal.coverNote && (
          <div className="card">
            <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-primary)', lineHeight: '1.7' }}>{proposal.coverNote}</p>
          </div>
        )}

        {/* Services & Pricing */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Services &amp; Pricing</h3>
          <div className="space-y-3">
            {services.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{s.description}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatNZD(s.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-4 mt-2" style={{ borderTop: '2px solid var(--bg-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
            <span className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>{formatNZD(proposal.totalValue)}</span>
          </div>
        </div>

        {/* What's Included */}
        {inclusionLines.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>What&apos;s Included</h3>
            <ul className="space-y-2">
              {inclusionLines.map((line, i) => (
                <li key={i} className="flex items-start gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Payment Terms */}
        {proposal.paymentTerms && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Payment Terms</h3>
            <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-secondary)', lineHeight: '1.7' }}>{proposal.paymentTerms}</p>
          </div>
        )}

        {/* Signature / Accept / Decline */}
        {proposal.status === 'sent' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Your Response</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              If you&apos;re happy with this proposal, click Accept to proceed. We&apos;ll be in touch with next steps.
            </p>
            <div className="flex gap-3">
              <button onClick={handleAccept} disabled={isPending} className="btn-primary">
                <Check className="w-4 h-4" /> {isPending ? 'Processing...' : 'Accept Proposal'}
              </button>
              <button onClick={handleDecline} disabled={isPending} className="btn-secondary" style={{ color: 'var(--danger)' }}>
                <X className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-8 pb-4">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&copy; {new Date().getFullYear()} Tui Media &middot; New Zealand</p>
        </div>
      </div>
    </div>
  )
}
