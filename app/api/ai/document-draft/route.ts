import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const DRAFT_START = '===DRAFT START==='
const DRAFT_END = '===DRAFT END==='

function systemPrompt(template: string, ctx: { clientName?: string; businessName?: string }): string {
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  return `You are helping Arlo Radford at Tui Media (Nelson NZ videography/photography) draft the body of a ${template}.

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

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const { template, messages, clientName, businessName } = await request.json()
  if (!template || !Array.isArray(messages)) {
    return Response.json({ error: 'template and messages are required.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })
  const apiMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: [{ type: 'text', text: systemPrompt(template, { clientName, businessName }), cache_control: { type: 'ephemeral' } }],
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
