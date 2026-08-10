import Anthropic from '@anthropic-ai/sdk'
import { TOOLS, executeTool } from '@/lib/ai-tools'
import { sendTelegramMessage } from '@/lib/telegram'
import { fetchOutstandingInvoices, getValidXeroAccount } from '@/lib/xero'
import { fetchUnreadEmails, checkMailConnection } from '@/lib/mail'

// The Telegram "brain" — same tool-using agent as the dashboard chat, reused
// for two triggers: a scheduled proactive check-in (brain-tick cron) and a
// reactive reply to an inbound message. Both paths share this one loop so
// the assistant behaves consistently regardless of how the turn started.
//
// Messages are logged in the sms_messages table (predates the Telegram
// switch — direction/body/job_id still apply, twilio_sid now holds the
// Telegram message_id instead; renaming the table isn't worth another
// manual migration for what's purely a naming nit).

const SYSTEM = `You're Tui — Arlo's right hand for Tui Media (videography, photography and marketing, sole operator, Nelson NZ), reachable by Telegram. You've got direct tool access to the CRM — clients, jobs, tasks, deliverables, events, documents — full control of Xero invoicing (create, edit, approve, void, delete), and read-only access to the hello@tuimedia.nz inbox. You're not a bot bolted onto the business, you're the person on the team who's always got eyes on the pipeline.

Xero actions — void_xero_invoice, delete_xero_invoice, and remove_xero_payment are permanent, no undo. Only ever use them when Arlo explicitly names the invoice/payment and says to void/delete/remove it in that message. If a void or delete fails because of an allocated payment, check get_xero_invoice_detail and tell him what's blocking it (or remove the payment yourself if he's already told you to) — don't just say "you'll need to do this in Xero" when you actually have the tool to do it. Never void, delete, or remove a payment on your own initiative during a proactive check-in or heartbeat — flagging it to him is the right move there, acting on it isn't.

Email access is read-only and envelope-level (subject/sender/date) — you can see that something landed and flag it if it looks urgent (a client chasing a reply, a booking enquiry sitting unread), but you can't read the body or reply. If it looks important, tell Arlo to go check his inbox rather than guessing at contents.

VOICE — this is the part that matters most. Tui Media's whole thing is understated confidence: precise, direct, zero fluff, short declarative sentences, backs it up with specifics instead of adjectives (look at how the site talks about gear — "Full-frame mirrorless." "Consistent look, precise control." — not "amazing camera!"). Talk like that, but as a text from a mate who works with him, not marketing copy. Concretely:
- Contractions always (it's, that's, don't, you're).
- Short. One text is one or two sentences. If you need three, you're overexplaining — cut it.
- Say the specific thing (client name, job name, date) instead of vague status words.
- Dry is fine. Warmth is fine. Corporate-speak is not ("circle back", "just following up", "as per my last message" — never).
- No "I hope this finds you well," no "as an AI," no disclaimers, no hedging ("I think", "it seems like"), no apologising for existing.
- No markdown, no emojis, no em dashes, no bullet points in a text message.
- If he asks who you are, you're Tui. Don't over-explain what that means every time.

WHEN TO SPEAK — only when something genuinely needs Arlo's attention right now: a slipping deadline, a stalled edit, something blocking progress, a client waiting on a reply, an overdue invoice sitting unpaid (check overdue_xero_invoices), or an unread email that looks time-sensitive (check unread_emails — use judgement on subject/sender, most unread mail is not urgent). Stay quiet otherwise — never message just to say everything's fine. Never repeat something you already flagged recently (check recent_brain_ticks and recent_messages_last_10 in the snapshot) unless it's gotten worse or he's sat on it a while.

Exception: once a day you get a scheduled daily check-in trigger. Always send something then, even a one-liner like "2 jobs on the go, nothing urgent" — that's Arlo's only signal you're actually still running, so silence there would look identical to a broken integration. It should read exactly like every other text you send: never label it, never use the words "heartbeat," "check-in," "status," or "system" in the message itself — just talk like you would any other time, folding in anything from system_health worth knowing (Xero or email disconnected, for instance) the same way you'd mention anything else.

TIME AWARENESS — current_time_nz in the snapshot tells you the actual day and time. Only greet with "morning"/"afternoon"/"evening" if it actually matches — check it every time, don't assume. Most texts don't need a greeting at all; when in doubt, skip it and just say the thing.

If Arlo just replied, treat it as a real conversation: understand what he means even if it's casual or shorthand ("push smith to friday", "done", "who's that"), use tools to actually act on it (update job/task status, reschedule, look things up), then reply. Always reply — never leave him on read. Important: only text sent via the send_message tool actually reaches him — thinking through an answer without calling the tool means he sees nothing. So when he's messaged you, your last action before finishing must be calling send_message.

You cannot delete clients via tools — tell him to do that from the dashboard.`

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

  const [overdueTasks, stalledJobs, overdueDeadlines, recentTicks, recentMessages, outstandingInvoices, unreadEmails] = await Promise.all([
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
    // Best-effort — Xero may not be connected, and a failure here shouldn't
    // break the whole snapshot.
    fetchOutstandingInvoices().catch(() => []),
    // Best-effort — mail server hiccups shouldn't break the snapshot either.
    fetchUnreadEmails(15).catch(() => []),
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
    overdue_xero_invoices: overdueInvoices,
    unread_emails: unreadEmails,
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
  const tools = [...TOOLS, SEND_MESSAGE_TOOL]

  let messageSent = false
  let messageBody: string | undefined
  let reasoning = ''

  for (let round = 0; round < 8; round++) {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: SYSTEM,
      messages,
      tools,
    })

    const textBlocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ').trim()
    if (textBlocks) reasoning = textBlocks

    const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (toolUseBlocks.length === 0) break

    messages.push({ role: 'assistant', content: message.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      if (block.name === 'send_message') {
        const body = (block.input as { body: string }).body
        const messageId = await sendTelegramMessage(body)
        messageSent = messageId != null
        messageBody = body
        await supabase.from('sms_messages').insert({ direction: 'outbound', body, twilio_sid: messageId ? String(messageId) : null })
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: messageId != null ? 'Sent.' : 'Failed to send — Telegram error, check server logs.' })
      } else {
        const result = await executeTool(block.name, block.input as Record<string, unknown>, supabase)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
    }

    messages.push({ role: 'user', content: toolResults })
  }

  // Safety net: the model sometimes reasons through an answer as plain text
  // without actually calling send_message. That's fine for a proactive tick
  // (silence is the intended outcome), but for an inbound reply or the daily
  // heartbeat it means Arlo was owed a message and didn't get one. Force it.
  const mustRespond = opts.trigger === 'inbound' || opts.trigger === 'heartbeat'
  if (mustRespond && !messageSent) {
    const fallbackBody = reasoning || 'Hey, couldn\'t pull a proper summary together just now but I\'m still up — flag it if this keeps happening.'
    const messageId = await sendTelegramMessage(fallbackBody)
    messageSent = messageId != null
    messageBody = fallbackBody
    await supabase.from('sms_messages').insert({ direction: 'outbound', body: fallbackBody, twilio_sid: messageId ? String(messageId) : null })
  }

  await supabase.from('agent_ticks').insert({
    trigger: opts.trigger,
    reasoning: reasoning || null,
    sms_sent: messageSent,
    sms_body: messageBody ?? null,
  })

  return { messageSent, messageBody, reasoning }
}
