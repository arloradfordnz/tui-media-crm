import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'
import { TOOLS, MUTATING_TOOLS, executeTool } from '@/lib/ai-tools'
import { buildDashboardSystem } from '@/lib/assistant-persona'
import { getContentBacklog, summariseBacklog } from '@/lib/content-backlog'

// Dashboard surface of the Tui assistant. Same persona and same tool set as
// the Telegram brain (lib/assistant-agent.ts) — this route just swaps the
// delivery: streamed text into the chat panel instead of send_message.
//
// Every exchange here is logged into sms_messages, the same table the
// Telegram loop reads and writes, so the dashboard panel and the Telegram
// thread are one continuous conversation.

// Static system prompt — stable across turns, cached with a cache_control
// breakpoint and reused on every request.
const STATIC_SYSTEM = buildDashboardSystem()

async function getDynamicContext(supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never) {
  const now = new Date()
  // NZ wall-clock, not UTC — the model needs the real local day and time or it
  // greets wrong and miscompares dates.
  const todayISO = now.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const nowNZ = now.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
  const weekFromNow = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const staleThreshold = new Date(now.getTime() - 7 * 86400000).toISOString()

  // All parallel — one round-trip's worth of latency for the whole context.
  // Xero and IMAP are deliberately absent: third-party calls would slow every
  // single message, and the model can reach for those via tools when asked.
  const [
    { data: weekEvents },
    { data: activeJobs },
    { count: totalClients },
    { data: overdueTasks },
    { data: stalledJobs },
    { data: recentThread },
    backlog,
  ] = await Promise.all([
    supabase.from('events').select('title, event_type, date, start_time').gte('date', todayISO).lte('date', weekFromNow).order('date').order('start_time').limit(7),
    supabase.from('jobs').select('name, status, clients(name)').not('status', 'in', '("delivered","archived")').order('created_at', { ascending: false }).limit(8),
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('job_tasks').select('title, due_date, jobs(name)').eq('completed', false).not('due_date', 'is', null).lte('due_date', todayISO).order('due_date').limit(10),
    supabase.from('jobs').select('name, status, updated_at, clients(name)').in('status', ['editing', 'review']).lt('updated_at', staleThreshold).order('updated_at').limit(10),
    supabase.from('sms_messages').select('direction, body, created_at').order('created_at', { ascending: false }).limit(8),
    getContentBacklog(supabase, now).catch(() => null),
  ])

  const clientName = (j: { clients: unknown }) => (j.clients as { name: string } | null)?.name

  const lines = [`current_time_nz: ${nowNZ} (today: ${todayISO}). Clients: ${totalClients ?? 0}.`]

  if ((weekEvents ?? []).length > 0)
    lines.push(`Schedule (7d): ${(weekEvents ?? []).map(e => `${e.date?.split('T')[0]} ${e.start_time || ''} ${e.title} (${e.event_type})`).join(' | ')}`)

  if ((activeJobs ?? []).length > 0)
    lines.push(`Active jobs: ${(activeJobs ?? []).map(j => `"${j.name}" [${j.status}]${clientName(j) ? ` — ${clientName(j)}` : ''}`).join(' | ')}`)

  if ((overdueTasks ?? []).length > 0)
    lines.push(`Overdue tasks: ${(overdueTasks ?? []).map(t => `"${t.title}" due ${t.due_date}${(t.jobs as unknown as { name: string } | null)?.name ? ` (${(t.jobs as unknown as { name: string }).name})` : ''}`).join(' | ')}`)

  if ((stalledJobs ?? []).length > 0)
    lines.push(`Stalled 7d+ in editing/review: ${(stalledJobs ?? []).map(j => `"${j.name}" [${j.status}]${clientName(j) ? ` — ${clientName(j)}` : ''}`).join(' | ')}`)

  const backlogText = backlog ? summariseBacklog(backlog) : ''
  if (backlogText) lines.push(backlogText)

  if ((recentThread ?? []).length > 0)
    lines.push(`Recent thread with Arlo (oldest first, spans Telegram and this panel): ${(recentThread ?? []).slice().reverse().map(m => `${m.direction === 'inbound' ? 'Arlo' : 'You'}: ${m.body}`).join(' | ')}`)

  return lines.join('\n')
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

  // Log the inbound message into the shared Telegram thread, in parallel with
  // building context so it costs no extra latency.
  const lastUser = [...apiMessages].reverse().find((m) => m.role === 'user')
  const inboundBody = typeof lastUser?.content === 'string' ? lastUser.content : null

  const [dynamicContext] = await Promise.all([
    getDynamicContext(supabase),
    inboundBody && !inboundBody.startsWith('[Project context:')
      ? supabase.from('sms_messages').insert({ direction: 'inbound', body: inboundBody })
      : Promise.resolve(),
  ])

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const currentMessages: Anthropic.MessageParam[] = [...apiMessages]
        const createdLinks: { path: string; label: string }[] = []
        let mutated = false
        let finalText = ''
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
            finalText += text
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
            // Log the reply into the shared thread so the Telegram brain knows
            // what was already discussed here and doesn't re-flag it.
            if (finalText.trim()) {
              await supabase.from('sms_messages').insert({ direction: 'outbound', body: finalText.trim() })
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
        controller.enqueue(encoder.encode('Something went wrong there. Try again.'))
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
