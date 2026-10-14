import Anthropic from '@anthropic-ai/sdk'

// The proposal drafter. Same arrangement as lib/contract-drafting.ts: Tui
// gathers the brief with one complete popup (lib/drafting-intake.ts), and this
// writes the client-facing proposal in a single Opus pass. The prices are never
// the model's: they come in as fixed lines and go back out unchanged, so the
// drafter writes words only. Output is structured JSON, shaped exactly like
// the proposals row, so nothing is parsed out of prose.

const MODEL = 'claude-opus-5-5'

export const PROPOSAL_DRAFTING_BRIEF = `You write proposals for Tui Media, a one-person video production business in Nelson, New Zealand, run by Arlo Radford. A proposal is what a small local business reads to decide whether to say yes. It is shown on a web page with four parts: a cover note, a priced list of services, a "What's included" list, and payment terms, with Accept and Decline buttons underneath.

You are given a complete brief that Arlo has already confirmed. Write from it, exactly. Never invent a deliverable, date, number, platform, inclusion or promise that is not in the brief. Never promise results (views, sales, leads): Tui Media does not guarantee outcomes.

VOICE. Arlo writing in the first person ("I"), to the client's main contact by first name. Warm, direct and plain, like a capable local tradesperson who knows video, not an agency. Short sentences. New Zealand English spelling (colour, organise). No hype words (elevate, unleash, stunning, world-class, game-changer, cutting-edge), no exclamation marks, no emojis. Never use an em dash or en dash: use a comma, a full stop or brackets instead.

COVER NOTE. 90 to 160 words, 2 or 3 short paragraphs. Open with their goal in their terms (the brief's goal, audience and angle), say in a sentence or two how this project gets them there, and close with the simple next step (tap Accept and I'll be in touch to lock in the date). Do not list prices or repeat the services list. Sign off "Arlo" on its own line.

SERVICES. You receive the price lines in order. Write one client-facing description per line, in the same order, 4 to 14 words each, saying what they actually get (counts, lengths, formats) rather than internal job names. Amounts are not yours to change and you do not write them.

WHAT'S INCLUDED. 5 to 9 lines, each one concrete thing (for example "Two 15-second vertical cut-downs for Reels and TikTok", "Licensed music and burned-in captions", "Two rounds of changes on each video"). Cover the deliverables, filming, the brief's inclusions, revisions (2 rounds per video unless the brief says otherwise) and delivery through the client portal. If the brief lists exclusions, end with one line that starts "Not included:" naming them.

PAYMENT TERMS. 2 to 4 short sentences. State the schedule from the brief with the actual dollar amounts worked out from the total (for example "$600 deposit to lock in your shoot date, then the remaining $600 on delivery"). Say invoices are due within 14 days by bank transfer. Say Tui Media is not GST registered so no GST is added. End with how long the price is valid, from the brief.

NOTES. For Arlo only, 1 to 3 lines: anything in the brief you had to interpret, or anything worth him checking before sending. "None." if nothing.`

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    cover_note: { type: 'string' },
    service_descriptions: { type: 'array', items: { type: 'string' } },
    inclusions: { type: 'array', items: { type: 'string' } },
    payment_terms: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['cover_note', 'service_descriptions', 'inclusions', 'payment_terms', 'notes'],
  additionalProperties: false,
} as const

export type PriceLine = { description: string; amount: number }

export type ProposalDraft =
  | { coverNote: string; services: PriceLine[]; inclusions: string[]; paymentTerms: string; total: number; notes: string }
  | { error: string }

const noDashes = (s: string) => s.replace(/\s*[—–]\s*/g, ', ').trim()

export async function draftProposal(opts: {
  clientName: string
  contactPerson: string | null
  jobName: string
  priceLines: PriceLine[]
  brief: string
  today: string
}): Promise<ProposalDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not configured.' }
  const anthropic = new Anthropic({ apiKey })
  const total = Math.round(opts.priceLines.reduce((s, l) => s + l.amount, 0) * 100) / 100

  const user = `Write the proposal.

CLIENT: ${opts.clientName}
MAIN CONTACT: ${opts.contactPerson || 'not on record (address the business warmly instead)'}
PROJECT: ${opts.jobName}
TODAY: ${opts.today}

PRICE LINES (fixed, in this order; write one description for each)
${opts.priceLines.map((l, i) => `${i + 1}. ${l.description}: $${l.amount}`).join('\n')}
TOTAL: $${total}

THE BRIEF (confirmed by Arlo)
${opts.brief.trim()}`

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PROPOSAL_SCHEMA } },
      system: [{ type: 'text', text: PROPOSAL_DRAFTING_BRIEF, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    } as unknown as Parameters<typeof anthropic.messages.stream>[0])
    const message = await stream.finalMessage()
    if (message.stop_reason === 'refusal') return { error: 'The drafter declined this one.' }
    if (message.stop_reason === 'max_tokens') return { error: 'The proposal ran past the length limit. Try again.' }
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
    const out = JSON.parse(text) as { cover_note: string; service_descriptions: string[]; inclusions: string[]; payment_terms: string; notes: string }

    // Descriptions are matched back to the fixed prices by position. A short
    // list keeps the original wording for the missing lines rather than
    // shifting a price onto the wrong description.
    const services = opts.priceLines.map((l, i) => ({
      description: noDashes(out.service_descriptions[i] || l.description),
      amount: l.amount,
    }))
    return {
      coverNote: noDashes(out.cover_note),
      services,
      inclusions: out.inclusions.map(noDashes).filter(Boolean),
      paymentTerms: noDashes(out.payment_terms),
      total,
      notes: out.notes?.trim() || '',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[proposal-drafting] failed:', err)
    return { error: `Drafting failed: ${msg.slice(0, 200)}` }
  }
}
