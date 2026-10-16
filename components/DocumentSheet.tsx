import { Calendar, MapPin } from 'lucide-react'
import DocumentBody from '@/components/DocumentBody'

// A saved document as the client reads it: the heading block, the body set by
// DocumentBody, and for a contract the two signatures. One component for both
// sides, so what Arlo checks under "What the client sees" on the document page
// is exactly what the client gets in their portal.

export type SheetForm = {
  clientName?: string
  contactPerson?: string
  date?: string
  jobDescription?: string
  shootDate?: string
  location?: string
  body?: string
  clientSignature?: string
  clientSignedAt?: string
  documentNumber?: string
}

// A bare "2026-10-15" is a calendar date, so it is read and printed in UTC and
// cannot slip a day; a full timestamp is shown as the day it was in NZ.
export const longDate = (iso: string | null | undefined) =>
  !iso ? '' : iso.length === 10
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-NZ', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })

export default function DocumentSheet({ template, form, title, emptyText }: { template: string; form: SheetForm; title: string; emptyText?: string }) {
  const isContract = template === 'Contract'
  const isSigned = !!form.clientSignature
  return (
    <>
      <div className="prop-preview-head">
        <p className="prop-eyebrow">{[template, form.documentNumber, longDate(form.date)].filter(Boolean).join(' · ')}</p>
        <h2 className="prop-title prop-title-sm">{title}</h2>
        {form.clientName && (
          <p className="prop-for">Prepared for {form.contactPerson ? `${form.contactPerson}, ` : ''}{form.clientName}</p>
        )}
        {(form.shootDate || form.location) && (
          <div className="prop-meta">
            {form.shootDate && <span><Calendar className="w-3.5 h-3.5" /> {longDate(form.shootDate)}</span>}
            {form.location && <span><MapPin className="w-3.5 h-3.5" /> {form.location}</span>}
          </div>
        )}
      </div>

      {form.body
        ? <DocumentBody body={form.body} />
        : <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{emptyText ?? 'Nothing written yet.'}</p>}

      {isContract && (
        <section className="doc-approval">
          <h2 className="prop-h">Approval</h2>
          <p className="doc-para">By signing below, both parties agree to the scope, terms and payment set out in this contract.</p>
          <div className="doc-sign">
            <div>
              <div className="doc-sign-line">Arlo Radford</div>
              <p className="doc-sign-name">Arlo Radford</p>
              <p className="doc-sign-meta">Tui Media</p>
            </div>
            <div>
              <div className={`doc-sign-line${isSigned ? '' : ' is-empty'}`}>{isSigned ? form.clientSignature : 'Awaiting signature'}</div>
              <p className="doc-sign-name">{form.contactPerson || form.clientName || 'Client'}</p>
              <p className="doc-sign-meta">
                {[form.contactPerson && form.clientName ? form.clientName : '', isSigned && form.clientSignedAt ? `Signed ${form.clientSignedAt}` : ''].filter(Boolean).join(' · ') || 'Client'}
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
