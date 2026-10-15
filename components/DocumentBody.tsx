import { renderInline } from '@/lib/markdown'

// A document body (a contract Tui drafted, or any other saved document) set the
// way a proposal reads, instead of as one pre-wrapped block of markdown. It
// follows the same rules as the PDF in TuiPdfDocument.tsx, so the two agree:
// lines next to each other join into one paragraph, a blank line ends it, and
// "#" / "##" / "###" lines are headings. On top of that it recognises the two
// shapes create_contract writes (lib/contract-drafting.ts): the "At a glance"
// summary of "**Label:** value" lines, set as label/value rows, and numbered
// clauses ("3.2 ..."), set with the number hanging in its own column.

type Block =
  | { kind: 'h3'; text: string }
  | { kind: 'facts'; rows: { label: string; value: string }[] }
  | { kind: 'clause'; num: string; text: string }
  | { kind: 'para'; text: string }

type Section = { heading: string | null; blocks: Block[] }

const FACT = /^\*\*([^*]+?):\*\*\s*(.+)$/
const CLAUSE = /^(\d+(?:\.\d+)+)\s+(.+)$/

export function parseDocumentBody(body: string): Section[] {
  const sections: Section[] = [{ heading: null, blocks: [] }]
  let buffer: string[] = []
  const current = () => sections[sections.length - 1]

  const flush = () => {
    if (!buffer.length) return
    const text = buffer.join(' ')
    buffer = []
    const blocks = current().blocks
    const fact = FACT.exec(text)
    if (fact) {
      const last = blocks[blocks.length - 1]
      const row = { label: fact[1], value: fact[2] }
      if (last?.kind === 'facts') last.rows.push(row)
      else blocks.push({ kind: 'facts', rows: [row] })
      return
    }
    const clause = CLAUSE.exec(text)
    if (clause) blocks.push({ kind: 'clause', num: clause[1], text: clause[2] })
    else blocks.push({ kind: 'para', text })
  }

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const h3 = /^###\s+(.+)/.exec(line)
    if (h3) { flush(); current().blocks.push({ kind: 'h3', text: h3[1] }); continue }
    const h = /^#{1,2}\s+(.+)/.exec(line)
    if (h) { flush(); sections.push({ heading: h[1], blocks: [] }); continue }
    buffer.push(line)
  }
  flush()
  return sections.filter((s) => s.heading || s.blocks.length)
}

// renderInline escapes before it adds <strong>, so this is safe to inject.
const html = (text: string) => ({ __html: renderInline(text) })

export default function DocumentBody({ body }: { body: string }) {
  const sections = parseDocumentBody(body)
  return (
    <div className="doc-body">
      {sections.map((s, i) => (
        <section key={i} className="doc-section">
          {s.heading && <h2 className="prop-h" dangerouslySetInnerHTML={html(s.heading)} />}
          {s.blocks.map((b, j) => {
            if (b.kind === 'h3') return <h3 key={j} className="doc-h3" dangerouslySetInnerHTML={html(b.text)} />
            if (b.kind === 'facts') return (
              <dl key={j} className="doc-facts">
                {b.rows.map((r, k) => (
                  <div key={k} className="doc-fact">
                    <dt>{r.label}</dt>
                    <dd dangerouslySetInnerHTML={html(r.value)} />
                  </div>
                ))}
              </dl>
            )
            if (b.kind === 'clause') return (
              <p key={j} className="doc-clause">
                <span className="doc-clause-num">{b.num}</span>
                <span dangerouslySetInnerHTML={html(b.text)} />
              </p>
            )
            return <p key={j} className="doc-para" dangerouslySetInnerHTML={html(b.text)} />
          })}
        </section>
      ))}
    </div>
  )
}
