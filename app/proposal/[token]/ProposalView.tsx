'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Check, X, MapPin, Calendar, Download, CheckCircle2 } from 'lucide-react'
import { acceptProposal, declineProposal } from '@/app/actions/proposals'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'
import ProposalDocument, { parseServices, parseInclusions, priceHeadline, type PricingMode } from '@/components/ProposalDocument'

// Written out in full: a client reads "14 October 2026", not "14/10/26".
const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' }) : ''

type ProposalData = {
  id: string
  token: string
  status: string
  coverNote: string | null
  services: string
  inclusions: string | null
  paymentTerms: string
  totalValue: number
  pricingMode: PricingMode
  priceSuffix: string | null
  sentAt: string | null
  respondedAt: string | null
  createdAt: string
  job: {
    name: string
    jobType: string | null
    shootDate: string | null
    shootLocation: string | null
    client: { name: string; contactPerson: string | null }
  }
}

export default function ProposalView({ proposal }: { proposal: ProposalData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)
  const [downloading, setDownloading] = useState(false)

  const services = parseServices(proposal.services)
  const inclusions = parseInclusions(proposal.inclusions)
  const issued = proposal.sentAt || proposal.createdAt
  const open = proposal.status === 'sent'
  const headline = priceHeadline(proposal.pricingMode, services, proposal.totalValue, proposal.priceSuffix)
  const picks = proposal.pricingMode === 'options'

  async function download() {
    setDownloading(true)
    try {
      const { downloadProposalPdf } = await import('@/lib/proposal-pdf')
      await downloadProposalPdf({
        jobName: proposal.job.name,
        clientName: proposal.job.client.name,
        contactPerson: proposal.job.client.contactPerson,
        shootDate: proposal.job.shootDate,
        shootLocation: proposal.job.shootLocation,
        coverNote: proposal.coverNote,
        services,
        inclusions,
        paymentTerms: proposal.paymentTerms,
        totalValue: proposal.totalValue,
        pricingMode: proposal.pricingMode,
        priceSuffix: proposal.priceSuffix,
        issuedAt: issued,
        status: proposal.status,
        respondedAt: proposal.respondedAt,
        url: window.location.href,
      })
    } catch (err) {
      console.error('Proposal PDF failed:', err)
    }
    setDownloading(false)
  }

  function handleAccept() {
    setConfirm({
      title: 'Accept this proposal?',
      body: 'This lets Arlo know you want to go ahead. He will be in touch to lock in the dates, and a short contract follows.',
      confirmLabel: 'Accept proposal',
      onConfirm: () => startTransition(async () => {
        await acceptProposal(proposal.token)
        router.refresh()
      }),
    })
  }

  function handleDecline() {
    setConfirm({
      title: 'Decline this proposal?',
      body: 'Nothing is final. If the scope or price is not quite right, reply to Arlo and he can rework it.',
      confirmLabel: 'Decline',
      destructive: true,
      onConfirm: () => startTransition(async () => {
        await declineProposal(proposal.token)
        router.refresh()
      }),
    })
  }

  return (
    <div className="prop-page">
      <header className="prop-topbar">
        <Image className="logo-light" src="/Primary_Black.svg" alt="Tui Media" width={124} height={26} />
        <Image className="logo-dark" src="/Primary_White.svg" alt="Tui Media" width={124} height={26} />
        <button type="button" onClick={download} disabled={downloading} className="btn-ghost btn-sm prop-topbar-dl">
          <Download className="w-3.5 h-3.5" /> {downloading ? 'Preparing…' : 'PDF'}
        </button>
      </header>

      <main className="prop-main animate-fade-in">
        <div className="prop-hero">
          <p className="prop-eyebrow">Proposal · {formatDate(issued)}</p>
          <h1 className="prop-title">{proposal.job.name}</h1>
          <p className="prop-for">Prepared for {proposal.job.client.contactPerson ? `${proposal.job.client.contactPerson}, ` : ''}{proposal.job.client.name}</p>
          {(proposal.job.shootDate || proposal.job.shootLocation) && (
            <div className="prop-meta">
              {proposal.job.shootDate && <span><Calendar className="w-3.5 h-3.5" /> {formatDate(proposal.job.shootDate)}</span>}
              {proposal.job.shootLocation && <span><MapPin className="w-3.5 h-3.5" /> {proposal.job.shootLocation}</span>}
            </div>
          )}
          <div className="prop-hero-total">
            <span>{headline}</span>
            <small>{picks ? 'pick a package, no GST' : 'total, no GST'}</small>
          </div>
        </div>

        {proposal.status === 'accepted' && (
          <div className="prop-banner prop-banner-ok">
            <CheckCircle2 className="w-4 h-4" /> You accepted this on {formatDate(proposal.respondedAt)}. Arlo will be in touch to lock in the dates.
          </div>
        )}
        {proposal.status === 'declined' && (
          <div className="prop-banner prop-banner-muted">
            You declined this on {formatDate(proposal.respondedAt)}. If you&apos;d like a different option, just reply to Arlo.
          </div>
        )}

        <div className="prop-card">
          <ProposalDocument body={{ coverNote: proposal.coverNote, services, inclusions, paymentTerms: proposal.paymentTerms, totalValue: proposal.totalValue, pricingMode: proposal.pricingMode, priceSuffix: proposal.priceSuffix }} />
        </div>

        {open && (
          <div className="prop-card prop-respond">
            <div>
              <h2 className="prop-h">Happy with it?</h2>
              <p className="prop-respond-copy">Accept and Arlo will be in touch to lock in the dates. If something isn&apos;t quite right, decline or just reply to his email.</p>
            </div>
            <div className="prop-respond-actions">
              <button onClick={handleAccept} disabled={isPending} className="btn-primary">
                <Check className="w-4 h-4" /> {isPending ? 'Saving…' : 'Accept proposal'}
              </button>
              <button onClick={handleDecline} disabled={isPending} className="btn-secondary">
                <X className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        )}

        <footer className="prop-footer">
          <span>Tui Media · Nelson, New Zealand</span>
          <a href="mailto:hello@tuimedia.nz">hello@tuimedia.nz</a>
        </footer>
      </main>

      {/* On a phone the decision stays in reach while reading. */}
      {open && (
        <div className="prop-mobile-bar">
          <span className="prop-mobile-total">{headline}</span>
          <button onClick={handleAccept} disabled={isPending} className="btn-primary btn-sm">
            <Check className="w-3.5 h-3.5" /> Accept
          </button>
        </div>
      )}

      <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
    </div>
  )
}
