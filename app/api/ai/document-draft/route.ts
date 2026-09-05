import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'

const DRAFT_START = '===DRAFT START==='
const DRAFT_END = '===DRAFT END==='

function systemPrompt(template: string, ctx: { clientName?: string; businessName?: string }): string {
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  return `You are helping Arlo Radford at Tui Media (Nelson NZ videography, photography and marketing) draft the body of a ${template}.

Today is ${today}.${ctx.clientName ? ` The client is ${ctx.clientName}.` : ''} The business is ${ctx.businessName || 'Tui Media'}.

Your job:
1. Ask short, focused questions ONE AT A TIME — never bundle.
2. Cover the topics that apply to a ${template}: parties, scope/services, timeline & delivery, payment, revisions, usage rights, cancellation. Skip what isn't relevant.
3. Keep questions to one sentence. Use NZ English. No emojis.
4. After you have enough info (or the user says "write it"), output the final document body in Markdown using "### Heading" for section headings (one short paragraph each, plain prose, no bullet lists unless the user asked for them).

When you output the final draft, wrap it EXACTLY between these markers on their own lines:
${DRAFT_START}
### Parties
...

### Services
...
${DRAFT_END}

Do not write anything after the closing marker. Before the markers, you may write one short sentence like "Here's a draft — let me know what to change.".`
}

// One-shot drafting, for the AI button in the corner of the Content field.
//
// The interview above is the right shape for a chat panel and the wrong shape
// for a button: you press it because you want a draft, not a conversation.
// Everything it would have asked is already on the form.
//
// What this knows about Tui Media comes from the rebrand master reference and
// lib/assistant-persona.ts, so a drafted contract describes the business as it
// actually operates rather than a generic videography shop. The formatting
// rules match what renderBody in TuiPdfDocument.tsx can actually render —
// telling the model about bullet lists it will render as literal asterisks is
// how you get a PDF full of asterisks.
const HOUSE_STYLE = `HOW TUI MEDIA WORKS. Arlo Radford, Nelson, New Zealand. The business sells one-off video ad projects, not retainers and not agency services. Say "video ads", never "video marketing". It is deliberately not an agency, and that framing is worth keeping rather than dropping for brevity.

Every project runs one fixed process: strategise, script, film, edit, then launch and manage. The launch phase runs the campaign for a set one-month period and that month is priced into the single project fee, not billed as an ongoing service. At the end of it everything is handed to the client: raw footage, final cuts, and the ad account itself.

The terms that follow from that, and which a contract or quote should state plainly: one project fee, no retainer, no lock-in, no ongoing commitment. No guarantee of results, ever, in any wording. Ad spend is separate and paid by the client straight to the platform, so nothing is marked up on the way through. Tui Media is not positioned as the cheapest option and should not be written as if it were.

VOICE. Plain and direct. No marketing words used only to sound impressive. Never the word "storytelling". Do not list services agency-style ("strategy, production and optimisation") — describe what happens instead. NZ English throughout. Never use an em dash, anywhere, for any reason: use a comma, a full stop or brackets. No emojis.`

const FORMAT_RULES = `FORMAT. The document is rendered by a PDF generator that understands exactly four things. Use only these:

# A heading         renders as a large poster-style headline in caps with an accent rule under it. Use it at most once or twice.
## A heading        renders as a section label in caps above a hairline rule. This is the workhorse for section titles.
### A heading       renders as a small inline heading in normal case.
**bold**            renders as bold inside a paragraph.

Everything else is a paragraph. Separate paragraphs with a blank line.

There are NO bullet lists and NO numbered lists. A line starting with "-" or "1." renders as literal text with the dash or the number in it, which looks broken. Where you would reach for a list, write a short paragraph or use ### headings for each item instead.`

function oneShotPrompt(template: string, ctx: DraftContext): string {
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const known = [
    ctx.clientName && `Client: ${ctx.clientName}`,
    ctx.contactPerson && `Key contact: ${ctx.contactPerson}`,
    ctx.clientEmail && `Client email: ${ctx.clientEmail}`,
    ctx.clientPhone && `Client phone: ${ctx.clientPhone}`,
    ctx.jobDescription && `The job: ${ctx.jobDescription}`,
    ctx.location && `Location: ${ctx.location}`,
    ctx.shootDate && `Shoot date: ${ctx.shootDate}`,
    ctx.date && `Document date: ${ctx.date}`,
  ].filter(Boolean).join('\n')

  return `You are drafting the body of a ${template} for ${ctx.businessName || 'Tui Media'}.

Today is ${today}.

${HOUSE_STYLE}

WHAT THIS DOCUMENT IS FOR. The form has already been filled in with:
${known || '(only the document type — write a sensible general draft and leave the specifics as placeholders)'}

Use those details. Do not restate them as a header block: the PDF already prints the client, the dates and the reference number on its cover, so repeating them in the body is duplication.

${FORMAT_RULES}

WHAT TO COVER in a ${template}, skipping anything that does not apply: who the parties are, what is being made and what the client receives, the timeline through to launch, what the fee covers and when it is payable, how many rounds of changes are included, who owns and may use the footage afterwards, and what happens if either side cancels.

Where a real figure is needed and has not been supplied, leave a square-bracketed placeholder like [project fee] or [number] rather than inventing one. A made-up price in a contract is worse than a blank.

Write the body now. No preamble, no sign-off, no closing commentary. Output the document body only.`
}

type DraftContext = {
  clientName?: string
  businessName?: string
  contactPerson?: string
  clientEmail?: string
  clientPhone?: string
  jobDescription?: string
  location?: string
  date?: string
  shootDate?: string
}

export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const body = await request.json()
  const { template, messages, mode } = body
  if (!template) {
    return Response.json({ error: 'template is required.' }, { status: 400 })
  }

  const oneShot = mode === 'oneshot'
  if (!oneShot && !Array.isArray(messages)) {
    return Response.json({ error: 'messages are required unless mode is "oneshot".' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })
  const ctx: DraftContext = body
  const apiMessages: Anthropic.MessageParam[] = oneShot
    ? [{ role: 'user', content: `Write the ${template} body.` }]
    : messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: oneShot ? 2500 : 1500,
          system: [{ type: 'text', text: oneShot ? oneShotPrompt(template, ctx) : systemPrompt(template, ctx), cache_control: { type: 'ephemeral' } }],
          messages: apiMessages,
        })
        s.on('text', (t) => controller.enqueue(encoder.encode(t)))
        await s.finalMessage()
        controller.close()
      } catch (err) {
        console.error('AI draft error:', err)
        controller.enqueue(encoder.encode('Sorry, something went wrong. Please try again.'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
