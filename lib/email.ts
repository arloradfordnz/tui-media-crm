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
}: {
  to: string
  subject: string
  html: string
  type: string
  clientId?: string
  jobId?: string
}) {
  if (!resend) {
    console.log(`[email skipped] No RESEND_API_KEY — would have sent to ${to}: ${subject}`)
    await logEmail({ to, subject, type, status: 'sent', clientId, jobId })
    return
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html })
    await logEmail({ to, subject, type, status: 'sent', clientId, jobId })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[email error]', err)
    await logEmail({ to, subject, type, status: 'failed', error: errorMessage, clientId, jobId })
  }
}

const SIGNOFF = `
  <p style="color:#d4d4d4;font-size:15px;line-height:1.6;margin:32px 0 0;">Ng\u0101 mihi,<br/><span style="color:#f5f5f5;font-weight:600;">Arlo Radford</span></p>
`

const NO_REPLY = `
  <div style="border-top:1px solid #222;margin-top:32px;padding-top:20px;">
    <p style="color:#555;font-size:13px;line-height:1.5;margin:0;">This is an automated message — please do not reply to this email. If you need to get in touch, email us at <a href="mailto:hello@tuimedia.nz" style="color:#7790ed;text-decoration:none;">hello@tuimedia.nz</a></p>
  </div>
`

function wrap(body: string) {
  return `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:48px 20px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:36px;">
          <img src="https://dashboard.tuimedia.nz/Primary_White.svg" alt="Tui Media" width="140" style="display:inline-block;" />
        </div>
        <div style="background:#0a0a0a;padding:0 8px;">
          ${body}
          ${SIGNOFF}
          ${NO_REPLY}
        </div>
        <p style="text-align:center;color:#444;font-size:12px;margin-top:32px;">&copy; ${new Date().getFullYear()} Tui Media &middot; <a href="https://tuimedia.nz" style="color:#555;text-decoration:none;">tuimedia.nz</a></p>
      </div>
    </div>
  `
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
    subject: 'Your video is ready for review — {{jobName}}',
    body: 'Your video for {{jobName}} is ready for review. Use the link below to watch it and share your feedback.',
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
      <div style="text-align:center;margin:28px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:#7790ed;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View Your Video</a>
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
      <div style="text-align:center;margin:28px 0;">
        <a href="${proposalUrl}" style="display:inline-block;background:#7790ed;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View Proposal</a>
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
