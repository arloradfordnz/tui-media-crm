import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = process.env.EMAIL_FROM || 'Tui Media <noreply@dashboard.tuimedia.nz>'

// Use service-level Supabase client for logging (works in any context, no cookies needed)
function getLogClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function logEmail({
  to,
  subject,
  type,
  status,
  error,
  clientId,
  jobId,
}: {
  to: string
  subject: string
  type: string
  status: 'sent' | 'failed'
  error?: string
  clientId?: string
  jobId?: string
}) {
  try {
    const supabase = getLogClient()
    if (!supabase) return
    await supabase.from('email_logs').insert({
      to_address: to,
      subject,
      type,
      status,
      error: error || null,
      client_id: clientId || null,
      job_id: jobId || null,
    })
  } catch (err) {
    console.error('[email log error]', err)
  }
}

async function send({
  to,
  subject,
  html,
  type,
  clientId,
  jobId,
  attachments,
  rethrow,
}: {
  to: string
  subject: string
  html: string
  type: string
  clientId?: string
  jobId?: string
  attachments?: { filename: string; content: string }[]
  rethrow?: boolean
}) {
  if (!resend) {
    console.log(`[email skipped] No RESEND_API_KEY — would have sent to ${to}: ${subject}`)
    await logEmail({ to, subject, type, status: 'sent', clientId, jobId })
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = { from: FROM, to, subject, html }
    if (attachments && attachments.length) payload.attachments = attachments
    await resend.emails.send(payload)
    await logEmail({ to, subject, type, status: 'sent', clientId, jobId })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[email error]', err)
    await logEmail({ to, subject, type, status: 'failed', error: errorMessage, clientId, jobId })
    if (rethrow) throw err
  }
}

const SIGNOFF = `
  <p style="color:#d4d4d4;font-size:15px;line-height:1.6;margin:32px 0 0;">Ng\u0101 mihi,<br/><span style="color:#f5f5f5;font-weight:600;">Arlo Radford</span></p>
`

const BRIEFING_SIGNOFF = `
  <p style="color:#f5f5f5;font-size:15px;font-weight:600;margin:32px 0 0;">Tui Media</p>
`

const NO_REPLY = `
  <div style="border-top:1px solid #222;margin-top:32px;padding-top:20px;">
    <p style="color:#555;font-size:13px;line-height:1.5;margin:0;">This is an automated message — please do not reply to this email. If you need to get in touch, email us at <a href="mailto:hello@tuimedia.nz" style="color:#7790ed;text-decoration:none;">hello@tuimedia.nz</a></p>
  </div>
`

function wrap(body: string, signoff = SIGNOFF) {
  return `<!DOCTYPE html>
<html lang="en" style="background:#0a0a0a;margin:0;padding:0;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark only" />
    <meta name="supported-color-schemes" content="dark only" />
    <meta name="theme-color" content="#0a0a0a" />
    <style>
      :root { color-scheme: dark only; supported-color-schemes: dark only; }
      html, body { background:#0a0a0a !important; margin:0 !important; padding:0 !important; }
      body, table, td, div, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      @media (prefers-color-scheme: light) {
        html, body, .email-bg { background:#0a0a0a !important; }
      }
    </style>
  </head>
  <body bgcolor="#0a0a0a" style="background:#0a0a0a;margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a" class="email-bg" style="background:#0a0a0a;width:100%;margin:0;padding:0;">
      <tr>
        <td align="center" bgcolor="#0a0a0a" style="background:#0a0a0a;padding:48px 0;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a" style="background:#0a0a0a;width:100%;max-width:560px;margin:0 auto;">
            <tr>
              <td align="left" bgcolor="#0a0a0a" style="background:#0a0a0a;padding:0 40px 36px;">
                <img src="https://dashboard.tuimedia.nz/Primary_White.svg" alt="Tui Media" width="140" style="display:block;" />
              </td>
            </tr>
            <tr>
              <td bgcolor="#0a0a0a" style="background:#0a0a0a;padding:0 40px;">
                ${body}
                ${signoff}
                ${NO_REPLY}
              </td>
            </tr>
            <tr>
              <td align="left" bgcolor="#0a0a0a" style="background:#0a0a0a;padding:32px 40px 0;color:#444;font-size:12px;">
                &copy; ${new Date().getFullYear()} Tui Media &middot; <a href="https://tuimedia.nz" style="color:#555;text-decoration:none;">www.tuimedia.nz</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// --- Default templates (fallback when DB has no custom entry) ---

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  welcome: {
    subject: 'Welcome to Tui Media',
    body: "Welcome to Tui Media! We're excited to have you on board and looking forward to bringing your vision to life.\n\nWe'll be in touch shortly to discuss your project and next steps. In the meantime, feel free to reach out if you have any questions.",
  },
  proposal: {
    subject: 'Proposal for {{jobName}} — Tui Media',
    body: "We've put together a proposal for {{jobName}}. Click below to view the details and let us know if you'd like to proceed.",
  },
  proposal_accepted: {
    subject: 'Proposal accepted — {{jobName}}',
    body: '{{clientName}} has accepted the proposal for {{jobName}}.\n\nThe job has been moved to Booked status.',
  },
  delivery: {
    subject: 'Your project is ready for review — {{jobName}}',
    body: 'Your project for {{jobName}} is ready for review. Use the link below to take a look and share your feedback.',
  },
  revision: {
    subject: 'Revision request received — {{jobName}}',
    body: "Your revision request (round {{round}}) for {{jobName}} has been received.\n\nWe'll get to work on the changes and send you an updated version soon.",
  },
  approval: {
    subject: 'Delivery approved — {{jobName}}',
    body: "Thank you for approving the delivery for {{jobName}}. We're glad you're happy with the result.\n\nYour final files will be prepared and delivered shortly.",
  },
}

// --- Template helpers ---

async function getTemplate(type: string): Promise<{ subject: string; body: string }> {
  try {
    const supabase = getLogClient()
    if (!supabase) return DEFAULT_TEMPLATES[type] || { subject: '', body: '' }

    const { data } = await supabase
      .from('email_templates')
      .select('subject, body')
      .eq('type', type)
      .single()

    if (data) return { subject: data.subject, body: data.body }
  } catch {
    // Fall through to default
  }
  return DEFAULT_TEMPLATES[type] || { subject: '', body: '' }
}

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

function bodyToHtml(body: string): string {
  return body
    .split('\n\n')
    .map((p) => `<p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;">${p}</p>`)
    .join('\n      ')
}

function buildGreeting(clientName?: string): string {
  const name = clientName ? ` ${clientName}` : ''
  return `<h2 style="margin:0 0 20px;font-size:22px;color:#f5f5f5;font-weight:600;">Kia ora${name},</h2>`
}

// --- Email functions ---

export async function sendPortalDeliveryEmail(to: string, clientName: string, jobName: string, portalUrl: string, clientId?: string, jobId?: string) {
  const tpl = await getTemplate('delivery')
  const vars = { clientName, jobName, portalUrl }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    type: 'delivery',
    clientId,
    jobId,
    html: wrap(`
      ${buildGreeting(clientName)}
      ${bodyToHtml(bodyText)}
      <div style="text-align:left;margin:28px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">View Your Project</a>
      </div>
      <p style="color:#555;font-size:13px;margin:0;">If the button doesn't work, copy this link: <a href="${portalUrl}" style="color:#7790ed;text-decoration:none;">${portalUrl}</a></p>
    `),
  })
}

export async function sendApprovalConfirmationEmail(to: string, clientName: string, jobName: string, clientId?: string, jobId?: string) {
  const tpl = await getTemplate('approval')
  const vars = { clientName, jobName }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    type: 'approval',
    clientId,
    jobId,
    html: wrap(`
      ${buildGreeting(clientName)}
      ${bodyToHtml(bodyText)}
    `),
  })
}

export async function sendRevisionRequestEmail(to: string, clientName: string, jobName: string, round: number, clientId?: string, jobId?: string) {
  const tpl = await getTemplate('revision')
  const vars = { clientName, jobName, round: String(round) }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    type: 'revision',
    clientId,
    jobId,
    html: wrap(`
      ${buildGreeting(clientName)}
      ${bodyToHtml(bodyText)}
    `),
  })
}

export async function sendProposalEmail(to: string, clientName: string, jobName: string, proposalUrl: string, clientId?: string, jobId?: string) {
  const tpl = await getTemplate('proposal')
  const vars = { clientName, jobName, proposalUrl }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    type: 'proposal',
    clientId,
    jobId,
    html: wrap(`
      ${buildGreeting(clientName)}
      ${bodyToHtml(bodyText)}
      <div style="text-align:left;margin:28px 0;">
        <a href="${proposalUrl}" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">View Proposal</a>
      </div>
      <p style="color:#555;font-size:13px;margin:0;">If the button doesn't work, copy this link: <a href="${proposalUrl}" style="color:#7790ed;text-decoration:none;">${proposalUrl}</a></p>
    `),
  })
}

export async function sendWelcomeEmail(to: string, clientName: string, clientId?: string) {
  const tpl = await getTemplate('welcome')
  const vars = { clientName }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    type: 'welcome',
    clientId,
    html: wrap(`
      ${buildGreeting(clientName)}
      ${bodyToHtml(bodyText)}
    `),
  })
}

type BriefingTodo = { title: string; dueDate: string | null; isOverdue: boolean; jobName: string | null }
type BriefingEvent = { title: string; startTime: string | null; jobName: string | null }
type BriefingUpcoming = { title: string; date: string; jobName: string | null }
type BriefingJob = { name: string; clientName: string | null }

type BriefingPayment = { name: string; clientName: string | null; amount: number; dueDate: string }

export type MorningBriefingData = {
  date: Date
  weather: { temp: number; description: string; windKph: number } | null
  todos: BriefingTodo[]
  overdueCount: number
  todayEvents: BriefingEvent[]
  upcomingEvents: BriefingUpcoming[]
  reviewJobs: BriefingJob[]
  weekJobCount: number
  income?: {
    expectedThisWeek: number
    expectedThisMonth: number
    upcomingPayments: BriefingPayment[]
  }
  aiSummary?: string | null
}

function fmtNZD(n: number) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n)
}

function fmtShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
}

function section(label: string, content: string) {
  return `
    <div style="border-top:1px solid #222;margin-top:28px;padding-top:20px;">
      <p style="color:#555;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px;">${label}</p>
      ${content}
    </div>
  `
}

export async function sendMorningBriefingEmail(data: MorningBriefingData) {
  const { date, weather, todos, overdueCount, todayEvents, upcomingEvents, reviewJobs, weekJobCount, income, aiSummary } = data

  const dayLabel = date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const shortDay = date.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })

  // Weather
  const weatherContent = weather
    ? `<p style="color:#f5f5f5;font-size:26px;font-weight:700;margin:0 0 4px;">${weather.temp}&deg;C</p>
       <p style="color:#a3a3a3;font-size:14px;line-height:1.6;margin:0;">${weather.description} &middot; Wind ${weather.windKph} km/h &middot; Nelson, NZ</p>`
    : `<p style="color:#a3a3a3;font-size:15px;margin:0;">Weather unavailable.</p>`

  // Todos
  const todoContent = todos.length === 0
    ? `<p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0;">All caught up — no outstanding to-dos.</p>`
    : todos.map((t) => {
        const duePart = t.dueDate
          ? ` &mdash; <span style="color:${t.isOverdue ? '#f87171' : '#555'};font-size:13px;">${t.isOverdue ? 'Overdue &middot; ' : ''}${fmtShortDate(t.dueDate)}</span>`
          : ''
        const jobPart = t.jobName ? ` <span style="color:#7790ed;font-size:13px;">${t.jobName}</span>` : ''
        return `<p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 10px;">${t.title}${duePart}${jobPart}</p>`
      }).join('')

  // Today
  const todayContent = todayEvents.length === 0
    ? `<p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0;">Nothing scheduled today.</p>`
    : todayEvents.map((e) => {
        const timePart = e.startTime ? ` <span style="color:#555;font-size:13px;">&middot; ${e.startTime}</span>` : ''
        const jobPart = e.jobName ? ` <span style="color:#7790ed;font-size:13px;">${e.jobName}</span>` : ''
        return `<p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 10px;">${e.title}${timePart}${jobPart}</p>`
      }).join('')

  // Upcoming
  const upcomingContent = upcomingEvents.length === 0
    ? `<p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0;">Nothing coming up this week.</p>`
    : upcomingEvents.map((e) => {
        const jobPart = e.jobName ? ` <span style="color:#7790ed;font-size:13px;">${e.jobName}</span>` : ''
        return `<p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 10px;"><span style="color:#555;font-size:13px;">${fmtShortDate(e.date)} &mdash;</span> ${e.title}${jobPart}</p>`
      }).join('')

  // Income forecast — built from job.expected_amount + job.expected_payment_date.
  const hasIncome = !!income && (income.expectedThisWeek > 0 || income.expectedThisMonth > 0 || income.upcomingPayments.length > 0)
  const upcomingPaymentsHtml = income && income.upcomingPayments.length > 0
    ? income.upcomingPayments.map((p) => {
        const clientPart = p.clientName ? ` <span style="color:#555;font-size:13px;">&mdash; ${p.clientName}</span>` : ''
        return `<p style="color:#a3a3a3;font-size:14px;line-height:1.6;margin:0 0 6px;"><span style="color:#555;font-size:13px;">${fmtShortDate(p.dueDate)} &mdash;</span> ${p.name}${clientPart} <span style="color:#f5f5f5;">${fmtNZD(p.amount)}</span></p>`
      }).join('')
    : ''
  const revenueContent = hasIncome && income
    ? `
        <p style="color:#f5f5f5;font-size:22px;font-weight:700;margin:0 0 4px;">${fmtNZD(income.expectedThisMonth)} <span style="color:#555;font-size:13px;font-weight:400;">expected this month</span></p>
        <p style="color:#a3a3a3;font-size:14px;margin:0 0 14px;">${fmtNZD(income.expectedThisWeek)} expected this week &middot; ${weekJobCount} active job${weekJobCount === 1 ? '' : 's'}</p>
        ${upcomingPaymentsHtml}
      `
    : `
        <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 8px;">Add an expected amount &amp; payment date to your jobs to see your forecast here.</p>
        <p style="color:#555;font-size:13px;margin:0;">Active jobs this week: <span style="color:#f5f5f5;">${weekJobCount}</span></p>
      `

  const aiSummaryContent = aiSummary
    ? `<p style="color:#d4d4d4;font-size:15px;line-height:1.7;margin:0;">${aiSummary.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`
    : ''

  // Review jobs
  const reviewContent = reviewJobs.length === 0
    ? ''
    : section('Awaiting Your Review',
        reviewJobs.map((j) => {
          const clientPart = j.clientName ? ` <span style="color:#555;font-size:13px;">&mdash; ${j.clientName}</span>` : ''
          return `<p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 10px;">${j.name}${clientPart}</p>`
        }).join('')
      )

  const todoLabel = `${todos.length} to-do${todos.length !== 1 ? 's' : ''}${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}`

  const subject = `Morning briefing — ${dayLabel}`

  const html = wrap(`
    <h2 style="margin:0 0 4px;font-size:22px;color:#f5f5f5;font-weight:600;">Good morning Arlo,</h2>
    <p style="color:#555;font-size:14px;margin:0;">${dayLabel}</p>
    ${section('Weather', weatherContent)}
    ${aiSummaryContent ? section('Focus For Today', aiSummaryContent) : ''}
    ${section('Income Forecast', revenueContent)}
    ${section(`To Do — ${todoLabel}`, todoContent)}
    ${section("Today's Schedule", todayContent)}
    ${section('Coming Up This Week', upcomingContent)}
    ${reviewContent}
    ${section('', `<a href="https://dashboard.tuimedia.nz" style="color:#7790ed;font-size:14px;text-decoration:none;">Open dashboard</a>`)}
  `, BRIEFING_SIGNOFF)

  await send({ to: 'hello@tuimedia.nz', subject, html, type: 'morning_briefing' })
}

const ADMIN_INBOX = 'hello@tuimedia.nz'

export async function sendAdminDeliveryViewedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Client viewed delivery — ${jobName}`
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#f5f5f5;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#f5f5f5;font-weight:600;">${clientName}</span> just opened the portal and viewed <span style="color:#f5f5f5;">${fileName}</span> for <span style="color:#7790ed;">${jobName}</span>.</p>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/jobs" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">Open dashboard</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_delivery_viewed', clientId, jobId })
}

export async function sendAdminDeliveryApprovedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Delivery approved — ${jobName}`
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#f5f5f5;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#f5f5f5;font-weight:600;">${clientName}</span> has approved <span style="color:#f5f5f5;">${fileName}</span> for <span style="color:#7790ed;">${jobName}</span>.</p>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/jobs" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">Open dashboard</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_delivery_approved', clientId, jobId })
}

export async function sendAdminRevisionRequestedEmail(clientName: string, jobName: string, round: number, request: string, jobId?: string, clientId?: string) {
  const subject = `Revision requested — ${jobName} (round ${round})`
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#f5f5f5;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#f5f5f5;font-weight:600;">${clientName}</span> has requested changes on <span style="color:#7790ed;">${jobName}</span> (round ${round}).</p>
    <div style="background:#111;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#d4d4d4;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;">${request.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/jobs" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">Open dashboard</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_revision_requested', clientId, jobId })
}

export async function sendAdminDocumentSignedEmail(clientName: string, docName: string, signature: string, signedAt: string, clientId?: string) {
  const subject = `Document signed — ${docName}`
  const safeSignature = signature.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#f5f5f5;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#f5f5f5;font-weight:600;">${clientName}</span> just signed <span style="color:#7790ed;">${docName}</span> on ${signedAt}.</p>
    <div style="background:#111;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#a3a3a3;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.04em;">Signature</p>
      <p style="color:#f5f5f5;font-size:20px;line-height:1.3;margin:0;font-family:'Patrick Hand',cursive;">${safeSignature}</p>
    </div>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/documents" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">Open dashboard</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_document_signed', clientId })
}

export async function sendDocumentToClientEmail({
  to,
  clientName,
  docName,
  template,
  clientId,
  portalToken,
}: {
  to: string
  clientName: string
  docName: string
  template: string
  clientId?: string
  portalToken?: string | null
}) {
  const subject = `${docName} — Tui Media`
  const intro = `Your ${template.toLowerCase()} is ready to view and sign. Click the button below to open it in your client portal — you can review the details and add your signature online. Let me know if anything needs changing.`
  const portalUrl = portalToken ? `https://dashboard.tuimedia.nz/portal/client/${portalToken}` : null
  const buttonSection = portalUrl
    ? `<div style="text-align:left;margin:28px 0 0;">
        <a href="${portalUrl}" target="_blank" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">View & Sign Document</a>
      </div>`
    : ''
  const html = wrap(`
    ${buildGreeting(clientName)}
    <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;">${intro}</p>
    ${buttonSection}
  `)
  await send({
    to,
    subject,
    html,
    type: 'document_to_client',
    clientId,
    rethrow: true,
  })
}

export async function sendDeliveryReminderEmail(
  to: string,
  clientName: string,
  jobName: string,
  portalUrl: string,
  daysSinceViewed: number,
  clientId?: string,
  jobId?: string,
) {
  const subject = `Just checking in — ${jobName}`
  const html = wrap(`
    ${buildGreeting(clientName)}
    <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;">Just a friendly nudge — I noticed you took a look at your project for <span style="color:#f5f5f5;">${jobName}</span> ${daysSinceViewed === 1 ? 'a day' : `${daysSinceViewed} days`} ago but haven't had a chance to come back to it yet.</p>
    <p style="color:#a3a3a3;font-size:15px;line-height:1.7;margin:0 0 16px;">No rush at all — whenever you're ready, you can approve it or send through any feedback right from the portal.</p>
    <div style="text-align:left;margin:28px 0;">
      <a href="${portalUrl}" style="display:inline-block;background:#7790ed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:400;font-size:13px;">Open Your Portal</a>
    </div>
    <p style="color:#555;font-size:13px;margin:0;">If anything's unclear or you'd rather chat it through, just reply to <a href="mailto:hello@tuimedia.nz" style="color:#7790ed;text-decoration:none;">hello@tuimedia.nz</a>.</p>
  `)
  await send({ to, subject, html, type: 'delivery_reminder', clientId, jobId })
}

export async function sendProposalAcceptedEmail(to: string, clientName: string, jobName: string, clientId?: string, jobId?: string) {
  const tpl = await getTemplate('proposal_accepted')
  const vars = { clientName, jobName }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    type: 'proposal_accepted',
    clientId,
    jobId,
    html: wrap(`
      ${buildGreeting()}
      ${bodyToHtml(bodyText)}
    `),
  })
}
