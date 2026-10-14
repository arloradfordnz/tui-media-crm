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

VOICE. This is Arlo writing to someone he has usually already met, in the first person ("I"). It must read like his own emails, which are below. Learned from about 25 of his sent emails to real clients:
- Greeting "Hi <first name>," (never "Dear"). Sign off with "Cheers," then "Arlo" on the next line. Never "Kind regards" or "Best".
- Short, plain sentences, about 13 words on average. Contractions always (I'd, I'm, you're, don't, we'll).
- Gets to the point in the first or second line. No warm-up compliment about their business.
- Talks about the work in his words: "videos", "reels", "a shoot", "filming and editing", "Meta ads", "the portal", "no GST", "$300 a month". States prices and what they cover in one straight line.
- Relaxed, local, friendly, a little casual ("Awesome", "keen", "sounds like a fun project", "and we'll go from there"). At most one exclamation mark in the whole proposal, and only if it is genuine.
- Typical lines of his: "Let me know which suits or if you want to tweak anything." "Anything extra I'd quote separately." "I'd suggest starting with 3 months and seeing how it goes." "There's no minimum term, I don't see a need to lock anyone in." "Happy to meet up for a chat."
- He never writes: reach out, circle back, touch base, hope this finds you well, excited to, elevate, leverage, solutions, unlock, world-class, stunning, game-changer, take it to the next level, or any guarantee of results. No em or en dashes ever: use a comma, a full stop or brackets.
- New Zealand English (colour, organise). "Kia ora" is fine as a greeting for someone he hasn't met.

A real email of his, for the feel (do not copy it):
  Hi Clare,
  Thanks for that, really helps. Here's two options:
  2 reels a month: $300  4 reels a month: $500
  Both include filming, editing and one round of revisions per reel. I'd suggest starting with 3 months and seeing how it goes. Anything extra, like the website video down the track, I'd quote separately.
  Let me know which suits or if you want to tweak anything.
  Cheers, Arlo

COVER NOTE. 70 to 140 words, 2 or 3 short paragraphs, written like one of his emails: "Hi <first name>," on its own line, then straight into what they told him they want (the brief's goal, audience and angle, in their terms), a sentence or two on how this gets them there, and the simple next step (have a look through, tap Accept and I'll be in touch to lock in the shoot). Do not list prices or repeat the services list. End with "Cheers," and "Arlo" on separate lines.

SERVICES. You receive the price lines in order. Write one client-facing description per line, in the same order, 4 to 14 words each, saying what they actually get (counts, lengths, formats) rather than internal job names. Amounts are not yours to change and you do not write them.

WHAT'S INCLUDED. 5 to 9 lines, each one concrete thing in his plain words, no full stops at the end (for example "Two 15-second vertical cut-downs for Reels and TikTok", "Licensed music and burned-in captions", "Two rounds of changes on each video"). Cover the deliverables, filming, the brief's inclusions, revisions (2 rounds per video unless the brief says otherwise) and delivery through the client portal. If the brief lists exclusions, end with one line that starts "Not included:" naming them.

PAYMENT TERMS. 2 to 5 short sentences, plain and direct like his emails. If the brief gives a travel fee, it goes here as its own plain sentence naming the places that are included and the flat amount beyond them (for example "Shoots in Nelson and Richmond are included. Anywhere further out is $30 extra per shoot, and I'll tell you before I book one."). Never put travel in the "Not included" line, and never leave it vague: if the brief says no travel fee, say nothing about travel. State the schedule from the brief with the actual dollar amounts worked out from the total (for example "$600 deposit to lock in your shoot date, then the remaining $600 on delivery"). Say invoices are due within 14 days by bank transfer. Say Tui Media is not GST registered so no GST is added. End with how long the price is valid, from the brief.

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
  /** 'options' means the price lines are packages the client chooses between. */
  pricingMode?: 'total' | 'options'
  priceSuffix?: string
}): Promise<ProposalDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not configured.' }
  const anthropic = new Anthropic({ apiKey })
  const options = opts.pricingMode === 'options'
  // For a pick-one proposal there is no sum. The stored figure is the cheapest
  // package, which the pages show as "From $X".
  const total = options
    ? Math.min(...opts.priceLines.map((l) => l.amount))
    : Math.round(opts.priceLines.reduce((s, l) => s + l.amount, 0) * 100) / 100

  const user = `Write the proposal.

CLIENT: ${opts.clientName}
MAIN CONTACT: ${opts.contactPerson || 'not on record (address the business warmly instead)'}
PROJECT: ${opts.jobName}
TODAY: ${opts.today}

${options
  ? `PRICE LINES: THESE ARE PACKAGES THE CLIENT CHOOSES BETWEEN, NOT ITEMS ADDED TOGETHER. They pick one${opts.priceSuffix ? ` and are charged ${opts.priceSuffix}` : ''}, and can switch later. There is NO total: never write a total or add the amounts up. Write one description per package that makes the difference between them obvious (what each includes). In the cover note, say they can pick the one that suits${opts.priceSuffix ? ` ${opts.priceSuffix.replace(/^a /, 'each ')}` : ''}. In the payment terms, describe how the chosen package is billed instead of a deposit schedule over a total.`
  : 'PRICE LINES (fixed, in this order; write one description for each)'}
${opts.priceLines.map((l, i) => `${i + 1}. ${l.description}: $${l.amount}${options && opts.priceSuffix ? ` ${opts.priceSuffix}` : ''}`).join('\n')}
${options ? '' : `TOTAL: $${total}`}

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
