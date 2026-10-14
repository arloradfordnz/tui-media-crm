'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, ExternalLink, Plus, Trash2, Copy, Check, Download, Save } from 'lucide-react'
import { updateProposal, sendProposal } from '@/app/actions/proposals'
import { formatNZD, formatDate, statusLabel, statusBadgeClass } from '@/lib/format'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'
import ProposalDocument, { parseServices, parseInclusions, priceHeadline, type PricingMode } from '@/components/ProposalDocument'

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
  pricingMode: PricingMode
  priceSuffix: string | null
  sentAt: string | null
  respondedAt: string | null
  createdAt: string
  job: {
    id: string
    name: string
    jobType: string | null
    shootDate: string | null
    shootLocation: string | null
    client: { id: string; name: string; contactPerson: string | null; email: string | null }
  }
}

// One page for writing, checking and sending a proposal. Edit and Preview
// share the same state, and Preview renders the exact component the client
// sees, so a draft can be checked before it goes anywhere (the public link
// only works once it has been sent).
export default function ProposalEditor({ proposal }: { proposal: ProposalData }) {
  const router = useRouter()
  const [saving, startSave] = useTransition()
  const [sending, startSend] = useTransition()
  // What the last save or send did, shown under the header so a click always
  // has a visible result.
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null)
  const [tab, setTab] = useState<'edit' | 'preview'>(proposal.status === 'draft' ? 'edit' : 'preview')
  const [services, setServices] = useState<ServiceLine[]>(() => parseServices(proposal.services))
  const [coverNote, setCoverNote] = useState(proposal.coverNote || '')
  const [inclusions, setInclusions] = useState(proposal.inclusions || '')
  const [paymentTerms, setPaymentTerms] = useState(proposal.paymentTerms || '')
  const [pricingMode, setPricingMode] = useState<PricingMode>(proposal.pricingMode)
  const [priceSuffix, setPriceSuffix] = useState(proposal.priceSuffix || '')
  const [dirty, setDirty] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)

  const isDraft = proposal.status === 'draft'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'
  const proposalUrl = `${baseUrl}/proposal/${proposal.token}`
  const options = pricingMode === 'options'
  // Adding the lines up only makes sense when the client takes all of them.
  // When they pick one, the stored figure is the cheapest, shown as "From".
  const total = options
    ? (services.length ? Math.min(...services.map((s) => s.amount || 0)) : 0)
    : services.reduce((sum, s) => sum + (s.amount || 0), 0)
  const headline = priceHeadline(pricingMode, services, total, priceSuffix)
  const inclusionList = parseInclusions(inclusions)
  const touch = () => { if (!dirty) setDirty(true) }

  function updateLine(i: number, patch: Partial<ServiceLine>) {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
    touch()
  }

  // Saves from any tab: the data lives in state here, not in the form, so it
  // does not matter whether the Edit tab is the one showing. Resolves true on
  // success so Send can save first.
  async function save(): Promise<boolean> {
    const fd = new FormData()
    fd.set('proposalId', proposal.id)
    fd.set('coverNote', coverNote)
    fd.set('services', JSON.stringify(services))
    fd.set('inclusions', inclusions)
    fd.set('paymentTerms', paymentTerms)
    fd.set('totalValue', String(total))
    fd.set('pricingMode', pricingMode)
    fd.set('priceSuffix', priceSuffix)
    try {
      const res = await updateProposal(undefined, fd)
      if (res && 'error' in res && res.error) { setNotice({ kind: 'error', text: res.error }); return false }
      setDirty(false)
      setNotice({ kind: 'ok', text: 'Saved.' })
      return true
    } catch {
      setNotice({ kind: 'error', text: "Couldn't save. Check your connection and try again." })
      return false
    }
  }

  function handleSave() {
    setNotice(null)
    startSave(async () => { await save() })
  }

  function handleSend() {
    setNotice(null)
    const confirmAndSend = () => setConfirm({
      title: `Send this to ${proposal.job.client.name}?`,
      body: proposal.job.client.email
        ? `${proposal.job.client.email} gets an email with a link to view and accept it. Check the figures first, it can't be edited once sent.`
        : `There's no email on ${proposal.job.client.name}'s record, so it will be marked sent and you can share the link yourself.`,
      confirmLabel: 'Send proposal',
      onConfirm: () => startSend(async () => {
        try {
          const res = await sendProposal(proposal.id)
          if (res.error) { setNotice({ kind: 'error', text: res.error }); return }
          setNotice(res.emailError
            ? { kind: 'warn', text: `Sent, but the email to ${proposal.job.client.email} didn't go out. Copy the link below and send it yourself.` }
            : { kind: 'ok', text: proposal.job.client.email ? `Sent to ${proposal.job.client.email}.` : 'Marked as sent. Copy the link below to share it.' })
          router.refresh()
        } catch {
          setNotice({ kind: 'error', text: "Couldn't send. Refresh the page to check whether it went." })
        }
      }),
    })
    // Unsaved edits are saved first, so what the client gets is what is on screen.
    if (dirty) startSend(async () => { if (await save()) confirmAndSend() })
    else confirmAndSend()
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(proposalUrl) } catch { /* clipboard blocked */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
        coverNote,
        services,
        inclusions: inclusionList,
        paymentTerms,
        totalValue: total,
        pricingMode,
        priceSuffix,
        issuedAt: proposal.sentAt || new Date().toISOString(),
        status: proposal.status,
        respondedAt: proposal.respondedAt,
        url: isDraft ? null : proposalUrl,
      })
    } catch (err) {
      console.error('Proposal PDF failed:', err)
    }
    setDownloading(false)
  }

  const timeline = [
    { label: 'Drafted', at: proposal.createdAt, done: true },
    { label: 'Sent', at: proposal.sentAt, done: !!proposal.sentAt },
    {
      label: proposal.status === 'declined' ? 'Declined' : 'Accepted',
      at: proposal.respondedAt,
      done: !!proposal.respondedAt,
    },
  ]

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/jobs/${proposal.jobId}`} className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> {proposal.job.name}
      </Link>

      <div className="page-header">
        <div className="page-header-left">
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Proposal</p>
          <h1 className="page-title">{proposal.job.name}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            For <Link href={`/dashboard/clients/${proposal.job.client.id}`} style={{ color: 'var(--accent)' }}>{proposal.job.client.name}</Link>
            {proposal.job.client.contactPerson ? ` · ${proposal.job.client.contactPerson}` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" onClick={download} disabled={downloading} className="btn-secondary">
            <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          {isDraft && dirty && (
            <button type="button" onClick={handleSave} disabled={saving || sending} className="btn-secondary">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          {isDraft && (
            <button type="button" onClick={handleSend} disabled={sending || saving} className="btn-primary">
              <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send to client'}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`alert ${notice.kind === 'ok' ? 'alert-success' : notice.kind === 'warn' ? 'alert-warning' : 'alert-danger'}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="tab-pills" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'edit'} className={`tab-pill${tab === 'edit' ? ' active' : ''}`} onClick={() => setTab('edit')}>
          {isDraft ? 'Edit' : 'Details'}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={`tab-pill${tab === 'preview' ? ' active' : ''}`} onClick={() => setTab('preview')}>
          What the client sees
        </button>
      </div>

      <div className="prop-editor-grid">
        <div className="space-y-5 min-w-0">
          {tab === 'preview' && (
            <div className="card prop-preview">
              <div className="prop-preview-head">
                <p className="prop-eyebrow">Proposal</p>
                <h2 className="prop-title prop-title-sm">{proposal.job.name}</h2>
                <p className="prop-for">Prepared for {proposal.job.client.contactPerson ? `${proposal.job.client.contactPerson}, ` : ''}{proposal.job.client.name}</p>
              </div>
              <ProposalDocument body={{ coverNote, services, inclusions: inclusionList, paymentTerms, totalValue: total, pricingMode, priceSuffix }} />
            </div>
          )}
          {tab === 'edit' && (
            <div className="space-y-5">

              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">Cover note</h3>
                  <p className="prop-edit-hint">The letter at the top. Keep it short and in your own words.</p>
                </div>
                <textarea name="coverNote" rows={9} value={coverNote} onChange={(e) => { setCoverNote(e.target.value); touch() }} className="field-input" disabled={!isDraft} placeholder={`Hi ${proposal.job.client.contactPerson?.split(' ')[0] || 'there'},`} />
              </section>

              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">Services and pricing</h3>
                  <p className="prop-edit-hint">NZD, no GST.</p>
                </div>
                <div className="prop-mode" role="radiogroup" aria-label="How the lines are priced">
                  <button type="button" role="radio" aria-checked={!options} disabled={!isDraft} className={`prop-mode-opt${!options ? ' is-on' : ''}`} onClick={() => { setPricingMode('total'); touch() }}>
                    <strong>Add together</strong>
                    <span>The client gets every line. Shows a total.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={options} disabled={!isDraft} className={`prop-mode-opt${options ? ' is-on' : ''}`} onClick={() => { setPricingMode('options'); touch() }}>
                    <strong>Pick one</strong>
                    <span>Each line is a package to choose from. No total.</span>
                  </button>
                </div>
                {options && (
                  <label className="prop-suffix">
                    <span className="label">After each price</span>
                    <input value={priceSuffix} onChange={(e) => { setPriceSuffix(e.target.value); touch() }} className="field-input" placeholder="a month" disabled={!isDraft} />
                  </label>
                )}
                <div className="prop-edit-lines">
                  {services.map((s, i) => (
                    <div key={i} className="prop-edit-line">
                      <input value={s.description} onChange={(e) => updateLine(i, { description: e.target.value })} className="field-input" placeholder="What they get" disabled={!isDraft} aria-label="Line description" />
                      <div className="prop-edit-amount">
                        <span aria-hidden="true">$</span>
                        <input type="number" step="0.01" inputMode="decimal" value={s.amount || ''} onChange={(e) => updateLine(i, { amount: Number(e.target.value) || 0 })} className="field-input" placeholder="0" disabled={!isDraft} aria-label="Line amount" />
                      </div>
                      {isDraft && (
                        <button type="button" onClick={() => { setServices(services.filter((_, idx) => idx !== i)); touch() }} className="btn-icon" aria-label="Remove line">
                          <Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="prop-edit-total">
                  {isDraft ? (
                    <button type="button" onClick={() => { setServices([...services, { description: '', amount: 0 }]); touch() }} className="btn-ghost btn-sm">
                      <Plus className="w-3.5 h-3.5" /> Add line
                    </button>
                  ) : <span />}
                  <div className="text-right">
                    <span className="label">{options ? 'Shown as' : 'Total'}</span>
                    <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{options ? headline : formatNZD(total)}</p>
                  </div>
                </div>
              </section>

              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">What&apos;s included</h3>
                  <p className="prop-edit-hint">One item per line. Each becomes a tick in the proposal.</p>
                </div>
                <textarea name="inclusions" rows={7} value={inclusions} onChange={(e) => { setInclusions(e.target.value); touch() }} className="field-input" disabled={!isDraft} />
              </section>

              <section className="card space-y-4">
                <div>
                  <h3 className="prop-edit-h">Payment terms</h3>
                  <p className="prop-edit-hint">Deposit, when the rest is due, and how long the price is good for.</p>
                </div>
                <textarea name="paymentTerms" rows={4} value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); touch() }} className="field-input" disabled={!isDraft} />
              </section>

            </div>
          )}
        </div>

        <aside className="prop-aside">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <span className="label">Status</span>
              <span className={`badge ${statusBadgeClass(proposal.status)}`}>{statusLabel(proposal.status)}</span>
            </div>
            <div>
              <span className="label">{options ? 'Price' : 'Total'}</span>
              <p className="prop-aside-total">{options ? <>From {formatNZD(total).replace('.00', '')}{priceSuffix ? <small> {priceSuffix}</small> : null}</> : headline}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{options ? `${services.length} package${services.length === 1 ? '' : 's'}, client picks one` : `${services.length} line${services.length === 1 ? '' : 's'}`} · no GST</p>
            </div>
            <ol className="prop-timeline">
              {timeline.map((t) => (
                <li key={t.label} className={t.done ? 'is-done' : ''}>
                  <span className="prop-timeline-dot">{t.done && <Check className="w-3 h-3" />}</span>
                  <span className="prop-timeline-label">{t.label}</span>
                  <span className="prop-timeline-at">{t.at ? formatDate(t.at) : ''}</span>
                </li>
              ))}
            </ol>
          </div>

          {!isDraft && (
            <div className="card space-y-4">
              <span className="label">Client link</span>
              <code className="prop-link">{proposalUrl.replace(/^https?:\/\//, '')}</code>
              <div className="flex gap-2">
                <button type="button" onClick={copyLink} className="btn-secondary btn-sm flex-1">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
                </button>
                <a href={proposalUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm flex-1">
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Also shows in {proposal.job.client.name}&apos;s client portal.</p>
            </div>
          )}

        </aside>
      </div>

      <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
    </div>
  )
}
