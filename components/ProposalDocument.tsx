import { CheckCircle2 } from 'lucide-react'
import { formatNZD } from '@/lib/format'

// The body of a proposal as the client reads it: the letter, the price, what
// is included and how to pay. Rendered on the public proposal page and in the
// editor's preview, so what Arlo checks is exactly what the client sees.

export type ProposalBody = {
  coverNote: string | null
  services: { description: string; amount: number }[]
  inclusions: string[]
  paymentTerms: string | null
  totalValue: number
}

export function parseServices(raw: string | null | undefined): { description: string; amount: number }[] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.map((l) => ({ description: String(l?.description ?? ''), amount: Number(l?.amount) || 0 })) : []
  } catch {
    return []
  }
}

export function parseInclusions(raw: string | null | undefined): string[] {
  return (raw || '').split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
}

export default function ProposalDocument({ body }: { body: ProposalBody }) {
  // "Not included: ..." is the drafter's last line. It is not a tick, so it
  // sits under the list as a plain note.
  const excluded = body.inclusions.filter((l) => /^not included/i.test(l))
  const included = body.inclusions.filter((l) => !/^not included/i.test(l))
  const paragraphs = (body.coverNote || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return (
    <div className="prop-doc">
      {paragraphs.length > 0 && (
        <section className="prop-letter">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      )}

      <section className="prop-section">
        <h2 className="prop-h">Services and pricing</h2>
        <div className="prop-lines">
          {body.services.map((s, i) => (
            <div key={i} className="prop-line">
              <span className="prop-line-desc">{s.description}</span>
              <span className="prop-line-amount">{formatNZD(s.amount)}</span>
            </div>
          ))}
        </div>
        <div className="prop-total">
          <span className="prop-total-label">Total</span>
          <span className="prop-total-value">{formatNZD(body.totalValue)}</span>
        </div>
        <p className="prop-total-note">NZD. Tui Media is not GST registered, so no GST is added.</p>
      </section>

      {body.inclusions.length > 0 && (
        <section className="prop-section">
          <h2 className="prop-h">What&apos;s included</h2>
          <ul className="prop-included">
            {included.map((line, i) => (
              <li key={i}>
                <CheckCircle2 className="prop-check" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {excluded.map((line, i) => <p key={i} className="prop-excluded">{line}</p>)}
        </section>
      )}

      {body.paymentTerms && (
        <section className="prop-section">
          <h2 className="prop-h">Payment terms</h2>
          <p className="prop-terms">{body.paymentTerms}</p>
        </section>
      )}
    </div>
  )
}
