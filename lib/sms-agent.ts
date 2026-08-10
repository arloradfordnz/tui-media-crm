import Anthropic from '@anthropic-ai/sdk'
import { TOOLS, executeTool } from '@/lib/ai-tools'
import { sendSms } from '@/lib/twilio'

// The SMS "brain" — same tool-using agent as the dashboard chat, reused for
// two triggers: a scheduled proactive check-in (brain-tick cron) and a
// reactive reply to an inbound text. Both paths share this one loop so the
// assistant behaves consistently regardless of how the turn started.

const SMS_SYSTEM = `You are Arlo's business-ops assistant for Tui Media (videography, photography and marketing, sole operator, Nelson NZ), reachable by SMS. You have direct tool access to the CRM — clients, jobs, tasks, deliverables, events, documents — and to Xero invoicing.

You behave like a sharp employee, not a reminder bot: only text when something genuinely needs Arlo's attention right now — a slipping deadline, a stalled edit, something blocking progress, a client waiting on a reply. Stay quiet otherwise. Never send a text just to say everything is fine, and never repeat something you already flagged recently (check recent_brain_ticks and recent_sms_last_10 in the snapshot) unless it has gotten worse or he hasn't acted on it after a while.

When you decide to text, call send_sms with ONE clear, specific, texting-length message (well under 300 characters) — plain language, no markdown, no emojis, straight to the point, like a text from a competent operations manager. Name the specific client/job.

If Arlo just replied to a text, treat it as a real conversation: understand what he means even if it's casual or shorthand ("push smith to friday", "done", "who's that"), use tools to actually act on it (update job/task status, reschedule, look things up), then call send_sms to reply so he gets a text back. Always reply to an inbound message — never leave him on read.

You cannot delete clients via tools — tell him to do that from the dashboard.`

const SEND_SMS_TOOL: Anthropic.Tool = {
  name: 'send_sms',
  description: 'Send an SMS to Arlo. Call this when something is worth texting about, or to reply to a message he just sent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      body: { type: 'string', description: 'Message text, well under 300 characters, no markdown or emojis.' },
    },
    required: ['body'],
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSnapshot(supabase: any): Promise<string> {
  const now = new Date()
  const todayISO = now.toISOString().split('T')[0]
  const staleThreshold = new Date(now.getTime() - 7 * 86400000).toISOString()

  const [overdueTasks, stalledJobs, overdueDeadlines, recentTicks, recentSms] = await Promise.all([
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
  ])

  return JSON.stringify({
    today: todayISO,
    overdue_tasks: overdueTasks.data ?? [],
    jobs_stalled_in_editing_or_review_7d_plus: stalledJobs.data ?? [],
    overdue_deadline_events: overdueDeadlines.data ?? [],
    recent_brain_ticks: recentTicks.data ?? [],
    recent_sms_last_10_oldest_first: (recentSms.data ?? []).slice().reverse(),
  })
}

export async function runSmsAgentTurn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { trigger: 'tick' | 'inbound'; inboundBody?: string }
): Promise<{ smsSent: boolean; smsBody?: string; reasoning: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const ownerPhone = process.env.OWNER_PHONE_NUMBER
  if (!apiKey || !ownerPhone) {
    const reasoning = 'Missing ANTHROPIC_API_KEY or OWNER_PHONE_NUMBER'
    console.error('[sms-agent]', reasoning)
    await supabase.from('agent_ticks').insert({ trigger: opts.trigger, reasoning, sms_sent: false })
    return { smsSent: false, reasoning }
  }

  const anthropic = new Anthropic({ apiKey })
  const snapshot = await buildSnapshot(supabase)

  const userTurn = opts.trigger === 'inbound'
    ? `Arlo just texted: "${opts.inboundBody}"\n\nCurrent CRM snapshot:\n${snapshot}`
    : `Scheduled check-in — review the CRM snapshot below and decide if anything needs a text right now.\n\n${snapshot}`

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn }]
  const tools = [...TOOLS, SEND_SMS_TOOL]

  let smsSent = false
  let smsBody: string | undefined
  let reasoning = ''

  for (let round = 0; round < 8; round++) {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: SMS_SYSTEM,
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
      if (block.name === 'send_sms') {
        const body = (block.input as { body: string }).body
        const sid = await sendSms(ownerPhone, body)
        smsSent = !!sid
        smsBody = body
        await supabase.from('sms_messages').insert({ direction: 'outbound', body, twilio_sid: sid })
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: sid ? 'Sent.' : 'Failed to send — Twilio error, check server logs.' })
      } else {
        const result = await executeTool(block.name, block.input as Record<string, unknown>, supabase)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
    }

    messages.push({ role: 'user', content: toolResults })
  }

  await supabase.from('agent_ticks').insert({
    trigger: opts.trigger,
    reasoning: reasoning || null,
    sms_sent: smsSent,
    sms_body: smsBody ?? null,
  })

  return { smsSent, smsBody, reasoning }
}
