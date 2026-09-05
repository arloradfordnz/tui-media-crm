import Anthropic from '@anthropic-ai/sdk'
import { TOOLS, executeTool } from '@/lib/ai-tools'
import { buildTelegramSystem } from '@/lib/assistant-persona'
import { sendTelegramMessage } from '@/lib/telegram'
import { fetchOutstandingInvoices, getValidXeroAccount } from '@/lib/xero'
import { fetchUnreadEmails, checkMailConnection } from '@/lib/mail'
import { getContentBacklog } from '@/lib/content-backlog'

// One place to change the model. Both the agent loop and the forced
// send_message round must run the same one — thinking blocks are echoed back
// between rounds and are only valid on the model that produced them.
const MODEL = 'claude-sonnet-5'

// The Telegram "brain" — same tool-using agent as the dashboard chat, reused
// for two triggers: a scheduled proactive check-in (brain-tick cron) and a
// reactive reply to an inbound message. Both paths share this one loop so
// the assistant behaves consistently regardless of how the turn started.
//
// Messages are logged in the sms_messages table (predates the Telegram
// switch — direction/body/job_id still apply, twilio_sid now holds the
// Telegram message_id instead; renaming the table isn't worth another
// manual migration for what's purely a naming nit).

// Identity, voice, and channel rules all live in assistant-persona.ts, shared
// with the dashboard chat so the two surfaces stay one personality.
const SYSTEM = buildTelegramSystem()

const SEND_MESSAGE_TOOL: Anthropic.Tool = {
  name: 'send_message',
  description: 'Send a Telegram message to Arlo. Keep it short — one or two sentences, like a real text, not an email. Call this when something is worth flagging, or to reply to a message he just sent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      body: { type: 'string', description: 'Message text. One or two short sentences — texting length, not paragraph length. Plain language, no markdown, no emojis, no em dashes.' },
    },
    required: ['body'],
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSnapshot(supabase: any): Promise<string> {
  const now = new Date()
  // NZ wall-clock, not UTC — matters both for correct date-boundary
  // comparisons and so the model actually knows what time it is (it was
  // previously working off a bare UTC date with no time-of-day at all,
  // which is how it ended up saying "morning" in the evening).
  const todayISO = now.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const nowNZ = now.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
  const staleThreshold = new Date(now.getTime() - 7 * 86400000).toISOString()

  const staleLeadThreshold = new Date(now.getTime() - 5 * 86400000).toISOString()
  const shootPrepWindow = new Date(now.getTime() + 5 * 86400000).toISOString()
  const staleProposalThreshold = new Date(now.getTime() - 4 * 86400000).toISOString()
  const dormantClientThreshold = new Date(now.getTime() - 90 * 86400000).toISOString()

  const [overdueTasks, stalledJobs, overdueDeadlines, recentTicks, recentMessages, openTodos, outstandingInvoices, unreadEmails, contentBacklog, coldLeads, shootsNeedingPrep, staleProposals, dormantClients] = await Promise.all([
    supabase.from('job_tasks')
      .select('id, title, due_date, jobs(id, name, status, clients(name))')
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lte('due_date', todayISO)
      .order('due_date')
      .limit(20),
    supabase.from('jobs')
      .select('id, name, status, updated_at, clients(name)')
      .in('status', ['editing', 'review'])
      .lt('updated_at', staleThreshold)
      .order('updated_at')
      .limit(20),
    supabase.from('events')
      .select('id, title, date, jobs(name)')
      .eq('event_type', 'deadline')
      .lt('date', todayISO)
      .order('date')
      .limit(10),
    supabase.from('agent_ticks')
      .select('ran_at, reasoning, sms_sent, sms_body')
      .order('ran_at', { ascending: false })
      .limit(5),
    supabase.from('sms_messages')
      .select('direction, body, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    // Open todos — general business items Arlo asked to be reminded about,
    // not tied to a specific job. This is the mechanism behind "text me
    // later about X": add a todo, it surfaces on the next scheduled tick.
    supabase.from('todos')
      .select('id, title, due_date')
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    // Best-effort — Xero may not be connected, and a failure here shouldn't
    // break the whole snapshot.
    fetchOutstandingInvoices().catch(() => []),
    // Best-effort — mail server hiccups shouldn't break the snapshot either.
    fetchUnreadEmails(15).catch(() => []),
    // Retainer content backlog — the honest measure of how far behind Arlo is,
    // counted from portal uploads rather than job status. Best-effort too: a
    // failure here should cost the backlog, not the whole snapshot.
    getContentBacklog(supabase, now).catch(() => null),
    // Pipeline leads that have gone quiet — nobody's touched them in 5+ days.
    // Distinct from "problems": this is a growth signal, not a delivery one.
    supabase.from('clients')
      .select('id, name, pipeline_stage, updated_at')
      .eq('status', 'lead')
      .in('pipeline_stage', ['enquiry', 'discovery', 'proposal', 'negotiation'])
      .lt('updated_at', staleLeadThreshold)
      .order('updated_at')
      .limit(10),
    // Jobs with a shoot inside the next 5 days that haven't reached shoot-ready
    // status yet — the "nothing's actually organised and the date is close" case.
    supabase.from('jobs')
      .select('id, name, shoot_date, status, clients(name)')
      .not('shoot_date', 'is', null)
      .gte('shoot_date', todayISO)
      .lte('shoot_date', shootPrepWindow)
      .in('status', ['enquiry', 'booked'])
      .order('shoot_date')
      .limit(10),
    // Proposals sent 4+ days ago with no response — worth a nudge or a follow-up.
    supabase.from('proposals')
      .select('id, status, sent_at, total_value, jobs(name, clients(name))')
      .eq('status', 'sent')
      .lt('sent_at', staleProposalThreshold)
      .is('responded_at', null)
      .order('sent_at')
      .limit(10),
    // Past clients gone quiet for 90+ days — a reconnect/upsell opportunity,
    // not a problem to fix.
    supabase.from('clients')
      .select('id, name, status, updated_at')
      .eq('status', 'past')
      .lt('updated_at', dormantClientThreshold)
      .order('updated_at')
      .limit(5),
  ])

  // Explicit connectivity checks — fetchOutstandingInvoices/fetchUnreadEmails
  // return [] both when "nothing to report" and "integration is broken",
  // which is exactly the ambiguity the heartbeat exists to resolve.
  const [xeroAccount, mailConnected] = await Promise.all([
    getValidXeroAccount().catch(() => null),
    checkMailConnection().catch(() => false),
  ])

  const todayForCompare = todayISO
  const overdueInvoices = outstandingInvoices
    .filter((inv) => inv.Status === 'AUTHORISED' && inv.AmountDue > 0 && !!inv.DueDateString && inv.DueDateString.slice(0, 10) < todayForCompare)
    .map((inv) => ({ number: inv.InvoiceNumber, amount_due: inv.AmountDue, due_date: inv.DueDateString?.slice(0, 10) }))

  return JSON.stringify({
    today: todayISO,
    current_time_nz: nowNZ,
    overdue_tasks: overdueTasks.data ?? [],
    jobs_stalled_in_editing_or_review_7d_plus: stalledJobs.data ?? [],
    overdue_deadline_events: overdueDeadlines.data ?? [],
    open_todos: openTodos.data ?? [],
    overdue_xero_invoices: overdueInvoices,
    retainer_content_backlog: contentBacklog,
    unread_emails: unreadEmails,
    cold_pipeline_leads: coldLeads.data ?? [],
    shoots_soon_without_prep: shootsNeedingPrep.data ?? [],
    proposals_awaiting_response: staleProposals.data ?? [],
    dormant_past_clients: dormantClients.data ?? [],
    system_health: {
      xero_connected: !!xeroAccount,
      email_connected: mailConnected,
    },
    recent_brain_ticks: recentTicks.data ?? [],
    recent_messages_last_10_oldest_first: (recentMessages.data ?? []).slice().reverse(),
  })
}

export async function runAssistantTurn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { trigger: 'tick' | 'inbound' | 'heartbeat'; inboundBody?: string }
): Promise<{ messageSent: boolean; messageBody?: string; reasoning: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID
  if (!apiKey || !chatId) {
    const reasoning = 'Missing ANTHROPIC_API_KEY or OWNER_TELEGRAM_CHAT_ID'
    console.error('[assistant-agent]', reasoning)
    await supabase.from('agent_ticks').insert({ trigger: opts.trigger, reasoning, sms_sent: false })
    return { messageSent: false, reasoning }
  }

  const anthropic = new Anthropic({ apiKey })
  const snapshot = await buildSnapshot(supabase)

  const userTurn = opts.trigger === 'inbound'
    ? `Arlo just messaged: "${opts.inboundBody}"\n\nCurrent CRM snapshot:\n${snapshot}`
    : opts.trigger === 'heartbeat'
    ? `[Internal note, not for Arlo: this is the once-daily trigger you must always reply to.] Send Arlo a short, ordinary-sounding text — just what's going on today (active jobs, anything worth flagging, system_health if anything's disconnected) — like you'd send any other time. Don't mention that this is a scheduled or automatic message.\n\n${snapshot}`
    : `Scheduled check-in — review the CRM snapshot below and decide if anything needs a message right now.\n\n${snapshot}`

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn }]
  // Cache breakpoints on the system prompt and the end of the tool list — the
  // agent loop re-sends both on every round, so from round two onward the
  // whole prefix is a cache hit. Cuts per-round latency and cost noticeably
  // on multi-tool turns.
  const tools = [...TOOLS, { ...SEND_MESSAGE_TOOL, cache_control: { type: 'ephemeral' } } as Anthropic.Tool]
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
  ]

  let messageSent = false
  let messageBody: string | undefined
  let reasoning = ''
  let truncated = false

  for (let round = 0; round < 8; round++) {
    const message = await anthropic.messages.create({
      model: MODEL,
      // Sonnet 5 thinks by default and thinking tokens are drawn from the same
      // max_tokens budget as the visible reply, so a 1024 ceiling was cutting
      // turns off mid-thought. Depth is controlled by effort below, not by
      // starving the ceiling.
      max_tokens: 8192,
      output_config: { effort: 'medium' },
      system: systemBlocks,
      messages,
      tools,
    })

    // A truncated turn is not an answer. Its partial text is the model's
    // working-out, and the old code fell through to the fallback and texted
    // exactly that to Arlo. Stop here and compose a real message instead.
    if (message.stop_reason === 'max_tokens') {
      truncated = true
      break
    }

    const textBlocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ').trim()
    if (textBlocks) reasoning = textBlocks

    const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (toolUseBlocks.length === 0) break

    messages.push({ role: 'assistant', content: message.content })

    // Fan tool calls out in parallel — they're mostly independent Supabase or
    // Xero lookups, so when the model batches several in one round we hide the
    // round-trips instead of stacking them. send_message stays in the same
    // fan-out; message order within a single round doesn't matter.
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        if (block.name === 'send_message') {
          const body = (block.input as { body: string }).body
          const messageId = await sendTelegramMessage(body)
          messageSent = messageId != null
          messageBody = body
          await supabase.from('sms_messages').insert({ direction: 'outbound', body, twilio_sid: messageId ? String(messageId) : null })
          return { type: 'tool_result', tool_use_id: block.id, content: messageId != null ? 'Sent.' : 'Failed to send — Telegram error, check server logs.' }
        }
        const result = await executeTool(block.name, block.input as Record<string, unknown>, supabase)
        return { type: 'tool_result', tool_use_id: block.id, content: result }
      })
    )

    messages.push({ role: 'user', content: toolResults })
  }

  // Safety net: the model sometimes reasons through an answer as plain text
  // without actually calling send_message. That's fine for a proactive tick
  // (silence is the intended outcome), but for an inbound reply or the daily
  // heartbeat it means Arlo was owed a message and didn't get one. Force it.
  const mustRespond = opts.trigger === 'inbound' || opts.trigger === 'heartbeat'
  if (mustRespond && !messageSent) {
    // One forced round: send_message is the only tool on offer and tool_choice
    // requires it, so this returns a written message or nothing.
    //
    // `reasoning` is deliberately NOT a candidate here. It holds the model's
    // own text blocks — its working-out — and using it as the body is how a
    // truncated turn ended up texting Arlo raw internal reasoning. The generic
    // line below is worse prose and infinitely better behaviour.
    let composed: string | null = null
    try {
      const forced = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: systemBlocks,
        messages: [
          { role: 'user', content: userTurn },
          {
            role: 'user',
            content: truncated
              ? 'Your previous attempt ran past the token limit. Send one short text now with what actually matters.'
              : 'Send one short text now.',
          },
        ],
        tools: [SEND_MESSAGE_TOOL],
        tool_choice: { type: 'tool', name: 'send_message' },
      })
      const block = forced.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'send_message'
      )
      const body = block ? (block.input as { body?: string }).body : undefined
      if (body && body.trim()) composed = body.trim()
    } catch (err) {
      console.error('[assistant] forced send_message round failed:', err)
    }

    const fallbackBody = composed ?? 'Hey, couldn\'t pull a proper summary together just now but I\'m still up — flag it if this keeps happening.'
    const messageId = await sendTelegramMessage(fallbackBody)
    messageSent = messageId != null
    messageBody = fallbackBody
    await supabase.from('sms_messages').insert({ direction: 'outbound', body: fallbackBody, twilio_sid: messageId ? String(messageId) : null })
  }

  await supabase.from('agent_ticks').insert({
    trigger: opts.trigger,
    reasoning: truncated ? `[truncated at max_tokens] ${reasoning}`.trim() : reasoning || null,
    sms_sent: messageSent,
    sms_body: messageBody ?? null,
  })

  return { messageSent, messageBody, reasoning }
}
