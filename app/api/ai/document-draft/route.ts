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

// One-shot drafting, for the AI button that sits on the Content field.
//
// The interview above is the right shape for a chat panel and the wrong shape
// for a button: you press it because you want a draft, not a conversation.
// Everything it would have asked is already on the form, so this reads the
// form and writes.
function oneShotPrompt(template: string, ctx: DraftContext): string {
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const known = [
    ctx.clientName && `Client: ${ctx.clientName}`,
    ctx.contactPerson && `Key contact: ${ctx.contactPerson}`,
    ctx.jobDescription && `Job: ${ctx.jobDescription}`,
    ctx.location && `Location: ${ctx.location}`,
    ctx.shootDate && `Shoot date: ${ctx.shootDate}`,
    ctx.date && `Document date: ${ctx.date}`,
  ].filter(Boolean).join('\n')

  return `You are drafting the body of a ${template} for ${ctx.businessName || 'Tui Media'}, Arlo Radford's videography, photography and marketing business in Nelson, New Zealand.

Today is ${today}.

What is already known:
${known || '(nothing beyond the document type — write a sensible general draft)'}

Write the body now. Do not ask questions and do not preface it with anything.

Rules:
- Markdown, using "### Heading" for each section, one or two short paragraphs of plain prose under each.
- Cover only what applies to a ${template}: parties, scope of services, timeline and delivery, payment terms, revisions, usage rights, cancellation.
- NZ English. No emojis. No em dashes.
- Where a real figure is genuinely needed and not supplied, leave a square-bracketed placeholder like [amount] rather than inventing one. A made-up price in a contract is worse than a blank.
- Output the document body only. No preamble, no sign-off, no markers.`
}

type DraftContext = {
  clientName?: string
  businessName?: string
  contactPerson?: string
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
