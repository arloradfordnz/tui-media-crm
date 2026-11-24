// Fills the contract's project sheet (lib/contract-terms.ts) from Arlo's
// answers. This is the only part of a contract a model writes now, and it
// writes facts, not law: one plain line per field, which code then drops into
// the fixed layout above the fixed terms. A cheap model is enough for that.
//
// It is also how a contract is changed afterwards: the current facts plus
// Arlo's instruction go back through here and the contract is reassembled, so
// the terms underneath can never drift. A change to a term itself goes into
// "anything else agreed", which the contract says wins over the terms.

import Anthropic from '@anthropic-ai/sdk'
import type { ContractKind, SheetFacts } from './contract-terms'

const MODEL = 'claude-sonnet-5-5'

const BRIEF = `You fill in the "At a glance" summary of a short New Zealand video services contract for Arlo Radford (trading as Tui Media for social content and events, or as Arlo Radford for weddings, brand films and commercial work). The legal terms under it are fixed and you never see or change them. You only write the facts of this deal, one plain line per field.

The fixed terms already say: 2 revision rounds per video; first edits through the client portal; invoices due 7 days after they are sent; the deposit is kept if the client cancels; a postponed event moves the deposit once; 14 days' notice to end monthly work; the client owns the final videos once paid; Tui Media may show the work in its portfolio. Do not repeat any of those in a field. If the deal changes one of them, write the change in "extras", which overrides the terms.

Rules:
- Use the facts given. NEVER invent a price, deposit amount, number of videos, date, time or venue. If one is needed and not given, write a short square-bracket blank like [fee] or [event date] in that field.
- Amounts like "$1,200", dates like "17 October 2026", plain casual New Zealand English, no em dashes or en dashes, never the word "storytelling".
- Each field is one short line, no full stops needed between clauses, no "the Client must".
- work: what is made, how many, lengths, formats, platforms.
- shoot: when and where filming happens and roughly how long (default "about 1 hour" if no length was agreed). Monthly: e.g. "1 shoot a month at your site in Nelson, about 1 hour, dates agreed month by month". Leave empty for an event (use event instead).
- event (events and weddings only, else empty): event name, date, start to finish times, venue, hours of coverage and any overtime rate.
- delivery: when the first edit arrives. Default "first edit within 3 working days of the shoot"; for an event use the agreed turnaround.
- fee: the fee, "a month" for monthly work, then "no GST (we are not GST registered)". For package choices, list them.
- deposit (one-off and events only, else empty): the amount paid on signing to hold the date, with the percentage. It can never be more than half the fee. If the deal says the whole fee is paid upfront, make the deposit half, set invoices to "the whole fee on signing", and add to extras: "The rest of the fee is paid in advance on signing. If you cancel, it is refunded less any work already done." If there is genuinely no deposit, write "No deposit".
- invoices: when each invoice is sent. Monthly: "first on signing, then on the same day each month, in advance". One-off and events: "deposit on signing, the balance when the final videos are delivered" unless the deal says otherwise.
- travel: the travel answer as one line, or "no travel fee".
- starts: monthly default "the day we both sign, month to month with no minimum term"; one-off: the shoot date or "on a date we agree after signing". Empty for an event.
- Turn relative dates into real ones using TODAY ("the 1st of next month" becomes "1 December 2026").
- extras: anything the client asked for or that changes the standard terms (more revision rounds, a different payment schedule, no portfolio use), one short sentence each, and nothing already written in another field. Empty if nothing.

When you are given CURRENT FACTS and a CHANGE, return all the fields again with only that change made (and anything that must change with it). Copy every other field exactly. In summary, say in one short line what you did.`

const SCHEMA = {
  type: 'object',
  properties: {
    work: { type: 'string' }, shoot: { type: 'string' }, event: { type: 'string' }, delivery: { type: 'string' },
    fee: { type: 'string' }, deposit: { type: 'string' }, invoices: { type: 'string' }, travel: { type: 'string' },
    starts: { type: 'string' }, extras: { type: 'string' }, summary: { type: 'string' },
  },
  required: ['work', 'shoot', 'event', 'delivery', 'fee', 'deposit', 'invoices', 'travel', 'starts', 'extras', 'summary'],
  additionalProperties: false,
}

const KIND_LABEL: Record<ContractKind, string> = {
  monthly: 'monthly content (retainer), no deposit',
  one_off: 'one-off project',
  event: 'event or wedding coverage',
}

export type SheetResult = { facts: SheetFacts; summary: string } | { error: string }

export async function fillSheet(opts: {
  kind: ContractKind
  /** Arlo's answers and any other agreed terms. */
  deal: string
  background?: string
  current?: SheetFacts
  change?: string
}): Promise<SheetResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not configured.' }
  const anthropic = new Anthropic({ apiKey })

  const user = [
    `TODAY: ${new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })}`,
    `KIND OF CONTRACT: ${KIND_LABEL[opts.kind]}`,
    opts.deal.trim() && `THE DEAL (from Arlo)\n${opts.deal.trim()}`,
    opts.background?.trim() && `BACKGROUND FROM THE CRM (context only, the deal wins)\n${opts.background.trim()}`,
    opts.current && `CURRENT FACTS\n${JSON.stringify(opts.current, null, 2)}`,
    opts.change && `CHANGE\n${opts.change.trim()}`,
  ].filter(Boolean).join('\n\n')

  try {
    const message = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: BRIEF, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as unknown as Parameters<typeof anthropic.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage

    if (message.stop_reason !== 'end_turn') return { error: `Filling the contract summary stopped early (${message.stop_reason}). Try again.` }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const out = JSON.parse(text) as SheetFacts & { summary: string }
    const clean = (s: string) => (s ?? '').replace(/\s*[—–]\s*/g, ', ').trim()
    const facts: SheetFacts = {
      work: clean(out.work), shoot: clean(out.shoot), event: clean(out.event), delivery: clean(out.delivery),
      fee: clean(out.fee), deposit: clean(out.deposit), invoices: clean(out.invoices), travel: clean(out.travel),
      starts: clean(out.starts), extras: clean(out.extras),
    }
    return { facts, summary: clean(out.summary) }
  } catch (err) {
    console.error('[contract-sheet] failed:', err)
    return { error: `Filling the contract summary failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` }
  }
}
