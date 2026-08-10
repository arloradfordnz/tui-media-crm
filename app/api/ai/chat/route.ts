import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'
import { TOOLS, MUTATING_TOOLS, executeTool } from '@/lib/ai-tools'

// Static system prompt — rules, voice, enums. Stable across turns, so we can
// cache it with a cache_control breakpoint and reuse it on every request.
const STATIC_SYSTEM = `You are the AI assistant for Tui Media CRM (Arlo Radford, videography, photography and marketing, Nelson NZ).

You can search, create, and update clients, jobs, events, documents, and deliverables. You can view stats and manage tasks.
IMPORTANT: You CANNOT delete clients. Client deletion is not permitted via AI — tell the user to do it from the client profile page.

Voice: professional, concise New Zealand English. Correct grammar and punctuation always. Never use emojis. Keep replies to one or two sentences unless the user asks for detail. Act immediately with tools rather than narrating what you are about to do. Use sensible defaults (status "lead", pipeline "enquiry"). Confirm completed actions in a single sentence.

Formatting: you may use Markdown — **bold** for emphasis on key nouns (names, statuses, dates) and *italic* sparingly for subtle emphasis. Do not use headings, lists, or code blocks unless explicitly asked.

Enums — Pipeline: enquiry,discovery,proposal,negotiation,won,lost | Client status: lead,active,past,archived | Client category (type): retainer,marketing,one_off | Job status: enquiry,booked,preproduction,shootday,editing,review,approved,delivered,archived | Events: shoot,meeting,deadline,personal | Docs: contract,invoice,brief,other`

async function getDynamicContext(supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never) {
  const now = new Date()
  const today = now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const todayISO = now.toISOString().split('T')[0]
  const weekFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const [
    { data: todayEvents },
    { data: activeJobs },
    { count: totalClients },
  ] = await Promise.all([
    supabase.from('events').select('title, event_type, date, start_time').gte('date', todayISO).lte('date', weekFromNow).order('date').order('start_time').limit(7),
    supabase.from('jobs').select('name, status, clients(name)').not('status', 'in', '("delivered","archived")').order('created_at', { ascending: false }).limit(8),
    supabase.from('clients').select('*', { count: 'exact', head: true }),
  ])

  const eventsBlock = (todayEvents ?? []).length > 0
    ? `\nSchedule (7d): ${(todayEvents ?? []).map(e => `${e.date?.split('T')[0]} ${e.start_time || ''} ${e.title} (${e.event_type})`).join(' | ')}`
    : ''

  const activeBlock = (activeJobs ?? []).length > 0
    ? `\nActive jobs: ${(activeJobs ?? []).map(j => `"${j.name}" [${j.status}]${(j.clients as unknown as { name: string })?.name ? ` — ${(j.clients as unknown as { name: string }).name}` : ''}`).join(' | ')}`
    : ''

  return `Today: ${today}. Clients: ${totalClients ?? 0}.${eventsBlock}${activeBlock}`
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const { messages } = await request.json()
  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: 'Messages array is required.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })
  const supabase = await createServerSupabaseClient()

  const apiMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const dynamicContext = await getDynamicContext(supabase)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const currentMessages: Anthropic.MessageParam[] = [...apiMessages]
        const createdLinks: { path: string; label: string }[] = []
        let mutated = false
        const maxRounds = 10

        // Two cache breakpoints: one after the large static system prompt, one
        // after the tool list. The static prompt hits the cache on every turn
        // regardless of changing live context; the second breakpoint extends
        // the cache over system + tools so a stable live context also hits.
        const cachedTools = TOOLS.map((t, i) =>
          i === TOOLS.length - 1
            ? ({ ...t, cache_control: { type: 'ephemeral' } } as Anthropic.Tool)
            : t
        )
        const systemBlocks: Anthropic.TextBlockParam[] = [
          { type: 'text', text: STATIC_SYSTEM, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: dynamicContext },
        ]

        for (let round = 0; round < maxRounds; round++) {
          const anthropicStream = anthropic.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: systemBlocks,
            messages: currentMessages,
            tools: cachedTools,
          })

          anthropicStream.on('text', (text) => {
            controller.enqueue(encoder.encode(text))
          })

          const finalMessage = await anthropicStream.finalMessage()

          const toolUseBlocks = finalMessage.content.filter(
            (block) => block.type === 'tool_use'
          )

          if (toolUseBlocks.length === 0) {
            if (mutated) {
              controller.enqueue(encoder.encode('[[MUTATED]]'))
            }
            if (createdLinks.length > 0) {
              for (const link of createdLinks) {
                controller.enqueue(encoder.encode(`\n[[LINK:${link.path}|${link.label}]]`))
              }
            }
            controller.close()
            return
          }

          controller.enqueue(encoder.encode('[[WORKING]]'))

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentMessages.push({ role: 'assistant', content: finalMessage.content as any })

          // Run tool calls in parallel — most are independent Supabase queries,
          // so fanning them out hides round-trip latency when the model asks
          // for several lookups at once.
          const results = await Promise.all(
            toolUseBlocks.map(async (block) => {
              if (block.type !== 'tool_use') return null
              const result = await executeTool(block.name, block.input as Record<string, unknown>, supabase)
              return { block, result }
            })
          )

          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const entry of results) {
            if (!entry) continue
            const { block, result } = entry
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })

            if (MUTATING_TOOLS.has(block.name)) mutated = true

            try {
              const parsed = JSON.parse(result)
              if (parsed.success) {
                if (parsed.client?.id) createdLinks.push({ path: `/dashboard/clients/${parsed.client.id}`, label: `View ${parsed.client.name || 'Client'}` })
                if (parsed.job?.id) createdLinks.push({ path: `/dashboard/jobs/${parsed.job.id}`, label: `View ${parsed.job.name || 'Job'}` })
                if (parsed.document?.id) createdLinks.push({ path: `/dashboard/documents/${parsed.document.id}`, label: `View ${parsed.document.name || 'Document'}` })
                if (parsed.event?.id) createdLinks.push({ path: `/dashboard/calendar`, label: 'View Calendar' })
              }
            } catch { /* not JSON or no link needed */ }
          }

          controller.enqueue(encoder.encode('[[/WORKING]]'))

          currentMessages.push({ role: 'user', content: toolResults })
        }

        controller.enqueue(encoder.encode('\n\n(Reached maximum tool rounds.)'))
        controller.close()
      } catch (err) {
        console.error('AI chat error:', err)
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
