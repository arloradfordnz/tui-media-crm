import Anthropic from '@anthropic-ai/sdk'
import { TOOLS, executeTool, CONFIRM_TOOLS, toolFingerprint } from '@/lib/ai-tools'
import { recordPendingAction } from '@/lib/assistant-approvals'
import { buildTelegramSystem } from '@/lib/assistant-persona'
import { sendTelegramMessage } from '@/lib/telegram'
import { buildContext, tierForTrigger } from '@/lib/tui/context'
import { syncFlags, markNotified } from '@/lib/tui/flags'

// One place to change the model. Both the agent loop and the forced
// send_message round must run the same one — thinking blocks are echoed back
// between rounds and are only valid on the model that produced them.
const MODEL = 'claude-sonnet-5'

// The Telegram "brain" — same tool-using agent as the dashboard chat, reused
// for the two triggers that remain: a reply to a message Arlo sent, and a
// client doing something in the portal. Both paths share this one loop so the
// assistant behaves consistently regardless of how the turn started.
//
// It used to have two more: a proactive sweep every few hours and a guaranteed
// daily check-in. Both are gone. Between them they sent the same message six
// times in a week, kept chasing August content well into September, and named
// a client who had been dropped a month earlier — and Arlo never once replied
// to any of it. A channel that talks every day whether or not it has news gets
// ignored, which costs you the one message that mattered.
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
      // The dedup ledger. Marked only after Telegram accepts the message, so a
      // send that fails does not silently bury the concern for a day.
      raised_flag_keys: {
        type: 'array',
        items: { type: 'string' },
        description: 'The exact key of every flag from flags_worth_raising that this message actually mentions. Leave empty if the message raises none of them. Getting this right is what stops you repeating yourself next time.',
      },
    },
    required: ['body'],
  },
}
export async function runAssistantTurn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { trigger: 'inbound' | 'event'; inboundBody?: string; eventSubject?: string; approvals?: string[] }
): Promise<{ messageSent: boolean; messageBody?: string; reasoning: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID
  if (!apiKey || !chatId) {
    const reasoning = 'Missing ANTHROPIC_API_KEY or OWNER_TELEGRAM_CHAT_ID'
    console.error('[assistant-agent]', reasoning)
    const { error: tickError } = await supabase.from('agent_ticks').insert({ trigger: opts.trigger, reasoning, sms_sent: false })
    if (tickError) console.error('[assistant-agent] agent_ticks insert failed:', tickError.message)
    return { messageSent: false, reasoning }
  }

  const anthropic = new Anthropic({ apiKey })
  // Tier the context to the trigger. An inbound reply gets two queries and no
  // third-party calls; a client action gets the delivery signals too.
  const tier = tierForTrigger(opts.trigger)
  const context = await buildContext(supabase, tier)

  // Reconcile what is true against what has already been said. An inbound
  // reply skips this: it is a conversation, and Arlo asking a question is not
  // an occasion to audit the pipeline.
  const flags = tier === 'micro' ? null : await syncFlags(supabase, context)
  if (flags) {
    context.flags_worth_raising = flags.due
    context.flags_held_back = flags.held
    context.flags_just_resolved = flags.resolved
    if (flags.note) context.flags_note = flags.note
  }

  const snapshot = JSON.stringify(context)

  const userTurn = opts.trigger === 'inbound'
    ? `Arlo just messaged: "${opts.inboundBody}"\n\nCurrent CRM snapshot:\n${snapshot}`
    : `Something just happened: ${opts.eventSubject ?? 'a client acted in the portal'}\n\nThis is the reason you woke up, so it's what the message should be about. Check the snapshot for the surrounding detail (which job, which client, where it now stands) and text him one short line. Do not fold in anything else — no backlog summary, no other flags, no "also worth noting". He gets a text because a client did something, and that thing is the whole message.\n\n${snapshot}`

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
          const input = block.input as { body: string; raised_flag_keys?: unknown }
          const body = input.body
          const messageId = await sendTelegramMessage(body)
          messageSent = messageId != null
          messageBody = body
          await supabase.from('sms_messages').insert({ direction: 'outbound', body, twilio_sid: messageId ? String(messageId) : null })
          // Only on a delivered message. A flag marked notified for a text that
          // never arrived is a concern buried for a day with no trace.
          if (messageId != null && Array.isArray(input.raised_flag_keys)) {
            const claimed = input.raised_flag_keys.filter((k): k is string => typeof k === 'string')
            // Intersected with what was actually offered this turn, so the
            // model cannot silence a flag it was never shown.
            const offered = new Set((flags?.due ?? []).map((f) => f.key))
            await markNotified(supabase, claimed.filter((k) => offered.has(k)))
          }
          return { type: 'tool_result', tool_use_id: block.id, content: messageId != null ? 'Sent.' : 'Failed to send — Telegram error, check server logs.' }
        }
        const toolInput = block.input as Record<string, unknown>
        const result = await executeTool(block.name, toolInput, supabase, { approvals: opts.approvals })

        // A destructive call the executor refused. Park it and hand the model
        // a code to quote, so Arlo has a way to say yes from a text message.
        if (CONFIRM_TOOLS.has(block.name) && result.includes('confirmation_required')) {
          const fingerprint = toolFingerprint(block.name, toolInput)
          let description = ''
          try {
            description = (JSON.parse(result) as { action?: string }).action ?? ''
          } catch { /* fall through to the tool name */ }
          const code = await recordPendingAction(supabase, {
            fingerprint,
            toolName: block.name,
            toolInput,
            description: description || block.name,
          })
          const withCode = code
            ? JSON.stringify({
                status: 'confirmation_required',
                action: description || block.name,
                instruction: `NOT executed. Tell Arlo exactly what this will do and ask him to reply "confirm ${code}". Quote the code exactly. Do not retry this tool.`,
              })
            : result
          return { type: 'tool_result', tool_use_id: block.id, content: withCode }
        }

        return { type: 'tool_result', tool_use_id: block.id, content: result }
      })
    )

    messages.push({ role: 'user', content: toolResults })
  }

  // Safety net: the model sometimes reasons through an answer as plain text
  // without actually calling send_message. Both remaining triggers are ones
  // Arlo is owed an answer to — he asked a question, or a client did something
  // — so a silent turn is always a bug here. Force it.
  const mustRespond = true
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

  // The result is checked now. This insert has been failing on every heartbeat
  // since the table was created — agent_ticks.trigger's CHECK allowed only
  // 'tick' and 'inbound' — and because nothing read the error, the daily
  // check-in was invisible in the assistant's own history.
  // See supabase/migration_agent_ticks_heartbeat.sql.
  const { error: tickInsertError } = await supabase.from('agent_ticks').insert({
    trigger: opts.trigger,
    reasoning: truncated ? `[truncated at max_tokens] ${reasoning}`.trim() : reasoning || null,
    sms_sent: messageSent,
    sms_body: messageBody ?? null,
  })
  if (tickInsertError) console.error('[assistant-agent] agent_ticks insert failed:', tickInsertError.message)

  return { messageSent, messageBody, reasoning }
}
