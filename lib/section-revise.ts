import Anthropic from '@anthropic-ai/sdk'

// Rewrites one highlighted section of a document, for the "Revise with Tui" box
// on the document page. Same model and effort as the contract quick edit
// (lib/contract-drafting.ts): a cheap, quick call that returns only the new
// section, so the rest of the document cannot change.

const MODEL = 'claude-sonnet-5-5'

const BRIEF = `You revise one highlighted section of a Tui Media document (usually a services agreement under New Zealand law, sometimes a quote, call sheet or brief). You are given the whole document for context, with the section marked, and what Arlo wants changed.

Return only the replacement for the marked section:
- Change what was asked and nothing else. Keep the same scope: if a single sentence is marked, return a single sentence; if a clause is marked, return the clause, keeping its number ("3.2 ...") at the start.
- Keep the formatting the document uses: "#" heading lines, **bold** labels, a blank line between clauses. Do not add a heading, a title or a note.
- Match the document's voice: plain New Zealand English, short sentences, "Tui Media will", "the Client must", amounts as "$1,200", dates as "17 October 2026". Never use an em dash or an en dash.
- Keep it consistent with the rest of the document. If the change would contradict another part, still make the change, and say so in the note.

In note, say in one short line what you changed (and anything elsewhere he should now check).`

const SCHEMA = {
  type: 'object',
  properties: { revised: { type: 'string' }, note: { type: 'string' } },
  required: ['revised', 'note'],
  additionalProperties: false,
}

export async function reviseSection(opts: { document: string; start: number; end: number; instructions: string }): Promise<{ revised: string; note: string } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not configured.' }
  const { document, start, end } = opts
  const section = document.slice(start, end)
  if (!section.trim()) return { error: 'Highlight the part you want changed first.' }
  const marked = `${document.slice(0, start)}[[SECTION START]]${section}[[SECTION END]]${document.slice(end)}`

  const anthropic = new Anthropic({ apiKey })
  try {
    const message = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: BRIEF, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `WHAT ARLO WANTS CHANGED\n${opts.instructions.trim()}\n\nTHE SECTION\n${section}\n\nTHE WHOLE DOCUMENT (section marked)\n${marked}` }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as unknown as Parameters<typeof anthropic.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage

    if (message.stop_reason === 'refusal') return { error: 'Tui declined that one. Try wording it differently.' }
    if (message.stop_reason !== 'end_turn') return { error: 'Tui did not finish. Try again.' }
    const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('')
    const out = JSON.parse(text) as { revised: string; note: string }
    // House rule, belt and braces: no em or en dashes.
    const revised = out.revised.replace(/\s*[—–]\s*/g, ', ')
    // Keep the whitespace the highlight had at its edges, so paragraphs stay apart.
    const lead = section.match(/^\s*/)?.[0] ?? ''
    const trail = section.match(/\s*$/)?.[0] ?? ''
    return { revised: lead + revised.trim() + trail, note: out.note.trim() }
  } catch (err) {
    console.error('[section-revise] failed:', err)
    return { error: "Couldn't reach Tui. Try again." }
  }
}
