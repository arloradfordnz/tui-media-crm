import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'
import { TOOLS, MUTATING_TOOLS, executeTool } from '@/lib/ai-tools'
import { buildDashboardSystem } from '@/lib/assistant-persona'
import { getContentBacklog, summariseBacklog } from '@/lib/content-backlog'
import { encodeEvent, toolLabel, summariseResult, type TuiEvent } from '@/lib/tui/receipts'

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

// A turn can fail for reasons that are worth naming. "Something went wrong"
// on an expired key or an empty credit balance costs an afternoon of debugging
// the wrong thing — this is a single-operator tool, and the person reading the
// message is the person who can fix the account.
function describeFailure(err: unknown): string {
  const status = (err as { status?: number })?.status
  // Belt and braces on the shape. The SDK's APIError carries the parsed body
  // on .error, but it also stringifies the whole body into .message, and which
  // one survives depends on where in the stream the failure surfaced — so
  // match against both rather than guessing.
  const detail = (err as { error?: { error?: { message?: string } } })?.error?.error?.message ?? ''
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const message = `${detail} ${raw}`

  if (/credit balance/i.test(message)) {
    return 'Out of Anthropic API credit, so I can\'t think right now. Top up the account and I\'ll be back.'
  }
  if (status === 401 || /api key/i.test(message)) {
    return 'My Anthropic API key is being rejected. Worth checking ANTHROPIC_API_KEY.'
  }
  if (status === 429) {
    return 'Rate limited by Anthropic. Give it a minute and ask again.'
  }
  if (status === 529 || status === 503) {
    return 'Anthropic is overloaded right now. Try again shortly.'
  }
  return 'Something went wrong there. Try again.'
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const { messages, approvals } = await request.json()
  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: 'Messages array is required.' }, { status: 400 })
  }
  // Fingerprints the user has explicitly approved for THIS request. They are
  // bound to the tool name plus its exact arguments (lib/ai-tools
  // toolFingerprint), so approving one deletion cannot authorise a different
  // one, and they are never persisted — an approval dies with the request that
  // carried it.
  const approvedFingerprints: string[] = Array.isArray(approvals)
    ? approvals.filter((a: unknown): a is string => typeof a === 'string')
    : []

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
      const send = (event: TuiEvent) => controller.enqueue(encoder.encode(encodeEvent(event)))

      try {
        const currentMessages: Anthropic.MessageParam[] = [...apiMessages]
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
            send({ t: 'text', v: text })
          })

          const finalMessage = await anthropicStream.finalMessage()

          const toolUseBlocks = finalMessage.content.filter(
            (block) => block.type === 'tool_use'
          )

          if (toolUseBlocks.length === 0) {
            if (mutated) send({ t: 'mutated' })
            // Log the reply into the shared thread so the Telegram brain knows
            // what was already discussed here and doesn't re-flag it.
            if (finalText.trim()) {
              await supabase.from('sms_messages').insert({ direction: 'outbound', body: finalText.trim() })
            }
            send({ t: 'done' })
            controller.close()
            return
          }

          // Announce every call BEFORE running it, so the receipt appears while
          // the work is in flight rather than after it. This is the whole point
          // of the rewrite: a turn that voids an invoice should not look
          // identical to a turn that reads the calendar.
          for (const block of toolUseBlocks) {
            if (block.type !== 'tool_use') continue
            send({
              t: 'tool',
              id: block.id,
              name: block.name,
              label: toolLabel(block.name, block.input as Record<string, unknown>),
            })
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentMessages.push({ role: 'assistant', content: finalMessage.content as any })

          // Run tool calls in parallel — most are independent Supabase queries,
          // so fanning them out hides round-trip latency when the model asks
          // for several lookups at once.
          const results = await Promise.all(
            toolUseBlocks.map(async (block) => {
              if (block.type !== 'tool_use') return null
              const result = await executeTool(block.name, block.input as Record<string, unknown>, supabase, { approvals: approvedFingerprints })
              return { block, result }
            })
          )

          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const entry of results) {
            if (!entry) continue
            const { block, result } = entry
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })

            if (MUTATING_TOOLS.has(block.name)) mutated = true

            const { ok, detail } = summariseResult(result)
            send({ t: 'tool_done', id: block.id, ok, detail })

            try {
              const parsed = JSON.parse(result)
              // A destructive call the user has not approved. Surface the
              // fingerprint so the UI can offer a real approve button rather
              // than relying on the model to relay the question faithfully.
              if (parsed.status === 'confirmation_required' && parsed.fingerprint) {
                send({ t: 'confirm', fingerprint: parsed.fingerprint, action: parsed.action ?? 'Confirm this action.' })
              }
              if (parsed.success) {
                if (parsed.client?.id) send({ t: 'link', path: `/dashboard/clients/${parsed.client.id}`, label: `View ${parsed.client.name || 'Client'}` })
                if (parsed.job?.id) send({ t: 'link', path: `/dashboard/jobs/${parsed.job.id}`, label: `View ${parsed.job.name || 'Job'}` })
                if (parsed.document?.id) send({ t: 'link', path: `/dashboard/documents/${parsed.document.id}`, label: `View ${parsed.document.name || 'Document'}` })
                if (parsed.event?.id) send({ t: 'link', path: `/dashboard/calendar`, label: 'View Calendar' })
              }
            } catch { /* not JSON or no link needed */ }
          }

          currentMessages.push({ role: 'user', content: toolResults })
        }

        send({ t: 'text', v: '\n\n(Reached maximum tool rounds.)' })
        send({ t: 'done' })
        controller.close()
      } catch (err) {
        console.error('AI chat error:', err)
        send({ t: 'error', v: describeFailure(err) })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      // Newline-delimited JSON. Not text/event-stream: this is a plain fetch
      // reader, not EventSource, and NDJSON keeps the framing to one newline.
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
