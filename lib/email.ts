import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = process.env.EMAIL_FROM || 'Tui Media <noreply@dashboard.tuimedia.nz>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'

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
    await logEmail({ to, subject, type, status: 'failed', error: 'No RESEND_API_KEY configured', clientId, jobId })
    if (rethrow) throw new Error('Email not configured — RESEND_API_KEY is missing.')
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
  <p style="color:#B8C3DA;font-size:15px;line-height:1.6;margin:32px 0 0;">Ng\u0101 mihi,<br/><span style="color:#EFF2F8;font-weight:600;">Arlo Radford</span></p>
`

const BRIEFING_SIGNOFF = `
  <p style="color:#EFF2F8;font-size:15px;font-weight:600;margin:32px 0 0;">Tui Media</p>
`

const NO_REPLY = `
  <div style="border-top:1px solid #1B2942;margin-top:32px;padding-top:20px;">
    <p style="color:#8996B2;font-size:13px;line-height:1.5;margin:0;">This is an automated message — please do not reply to this email. If you need to get in touch, email us at <a href="mailto:hello@tuimedia.nz" style="color:#EFF2F8;text-decoration:underline;">hello@tuimedia.nz</a></p>
  </div>
`

function wrap(body: string, signoff = SIGNOFF, preheader?: string) {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#060D1A;font-size:1px;line-height:1px;">${preheader}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>`
    : ''
  return `<!DOCTYPE html>
<html lang="en" style="background:#060D1A;margin:0;padding:0;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark only" />
    <meta name="supported-color-schemes" content="dark only" />
    <meta name="theme-color" content="#060D1A" />
    <style>
      @font-face {
        font-family: 'Bricolage Grotesque';
        font-style: normal;
        font-weight: 200 800;
        font-display: swap;
        src: url(https://dashboard.tuimedia.nz/fonts/bricolage-grotesque-latin.woff2) format('woff2');
      }
      :root { color-scheme: dark only; supported-color-schemes: dark only; }
      html, body { background:#060D1A !important; margin:0 !important; padding:0 !important; }
      body, table, td, div, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      @media (prefers-color-scheme: light) {
        html, body, .email-bg { background:#060D1A !important; }
      }
    </style>
  </head>
  <body bgcolor="#060D1A" style="background:#060D1A;margin:0;padding:0;font-family:'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;color:#EFF2F8;">
    ${preheaderHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#060D1A" class="email-bg" style="background:#060D1A;width:100%;margin:0;padding:0;">
      <tr>
        <td align="center" bgcolor="#060D1A" style="background:#060D1A;padding:48px 0;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#060D1A" style="background:#060D1A;width:100%;max-width:560px;margin:0 auto;">
            <tr>
              <td align="left" bgcolor="#060D1A" style="background:#060D1A;padding:0 40px 36px;">
                <img src="https://dashboard.tuimedia.nz/Primary_White.png" alt="Tui Media" width="140" height="29" style="display:block;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td bgcolor="#060D1A" style="background:#060D1A;padding:0 40px;">
                ${body}
                ${signoff}
                ${NO_REPLY}
              </td>
            </tr>
            <tr>
              <td align="left" bgcolor="#060D1A" style="background:#060D1A;padding:32px 40px 0;color:#5F6E8C;font-size:12px;">
                &copy; ${new Date().getFullYear()} Tui Media &middot; <a href="https://tuimedia.nz" style="color:#8996B2;text-decoration:none;">www.tuimedia.nz</a>
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
  revision_accepted: {
    subject: 'Your revisions are underway — {{jobName}}',
    body: "Good news — your revision request (round {{round}}) for {{jobName}} has been accepted and we're onto it now.\n\nWe'll send through the updated version as soon as it's ready.",
  },
  revision_declined: {
    subject: 'About your revision request — {{jobName}}',
    body: "We've had a look at your revision request (round {{round}}) for {{jobName}} and unfortunately we won't be able to make these changes as part of this round.\n\nIf you'd like to talk it through, just get in touch and we'll sort something out.",
  },
  revision_reply: {
    subject: 'A note about your revisions — {{jobName}}',
    body: "We've left a note on your revision request (round {{round}}) for {{jobName}} — see below.",
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
    .map((p) => `<p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;">${p}</p>`)
    .join('\n      ')
}

function buildGreeting(clientName?: string): string {
  const name = clientName ? ` ${clientName}` : ''
  return `<h2 style="margin:0 0 20px;font-size:22px;color:#EFF2F8;font-weight:600;">Kia ora${name},</h2>`
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
        <a href="${portalUrl}" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">View Your Project</a>
      </div>
      <p style="color:#8996B2;font-size:13px;margin:0;">If the button doesn't work, copy this link: <a href="${portalUrl}" style="color:#EFF2F8;text-decoration:underline;">${portalUrl}</a></p>
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

export async function sendRevisionResponseEmail(
  to: string,
  clientName: string,
  jobName: string,
  round: number,
  response: 'accepted' | 'declined' | 'reply',
  reply?: string | null,
  clientId?: string,
  jobId?: string,
) {
  const type = response === 'reply' ? 'revision_reply' : `revision_${response}`
  const tpl = await getTemplate(type)
  const vars = { clientName, jobName, round: String(round) }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  const replyBlock = reply?.trim()
    ? `<div style="background:#0F1930;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="color:#8996B2;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.04em;">Note from Tui Media</p>
        <p style="color:#B8C3DA;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;">${reply.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      </div>`
    : ''

  await send({
    to,
    subject,
    type,
    clientId,
    jobId,
    html: wrap(`
      ${buildGreeting(clientName)}
      ${bodyToHtml(bodyText)}
      ${replyBlock}
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
        <a href="${proposalUrl}" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">View Proposal</a>
      </div>
      <p style="color:#8996B2;font-size:13px;margin:0;">If the button doesn't work, copy this link: <a href="${proposalUrl}" style="color:#EFF2F8;text-decoration:underline;">${proposalUrl}</a></p>
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

type BriefingRevision = { round: number; request: string; jobName: string | null; clientName: string | null }
type BriefingShoot = { title: string; date: string; jobName: string | null }
type BriefingNews = { headline: string; summary: string }

type XeroSummaryData = {
  org_name: string | null
  bank_balance_nzd: number | null
  outstanding_invoices_nzd: number
  outstanding_invoice_count: number
  overdue_invoices_nzd: number
  overdue_invoice_count: number
  revenue_this_month_nzd: number | null
  net_profit_this_month_nzd: number | null
}

export type MorningBriefingData = {
  date: Date
  weather: { temp: number; description: string; windKph: number } | null
  xero?: XeroSummaryData | null
  pendingRevisions?: BriefingRevision[]
  upcomingShoots?: BriefingShoot[]
  news?: BriefingNews | null
  aiSummary?: string | null
}

function fmtNZD(n: number) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n)
}

const NZ_TZ = 'Pacific/Auckland'

function fmtShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-NZ', { timeZone: NZ_TZ, weekday: 'short', day: 'numeric', month: 'short' })
}

function section(label: string, content: string) {
  return `
    <div style="border-top:1px solid #1B2942;margin-top:28px;padding-top:20px;">
      <p style="color:#8996B2;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px;">${label}</p>
      ${content}
    </div>
  `
}

// Bento card — a single subtle border, separated from its neighbours by margin so
// no two dividers ever stack. This is the visual unit the briefing is built from.
function card(label: string, content: string, pad = '22px 24px') {
  return `
    <div style="background:#0F1930;border:1px solid #22304D;border-radius:16px;padding:${pad};margin:14px 0 0;">
      ${label ? `<p style="color:#7A88A6;font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;margin:0 0 16px;">${label}</p>` : ''}
      ${content}
    </div>
  `
}

export async function sendMorningBriefingEmail(data: MorningBriefingData) {
  const { date, weather, xero, pendingRevisions, upcomingShoots, news, aiSummary } = data

  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Format in NZ time — the cron server runs on UTC, so at ~7am NZST an un-zoned
  // formatter renders the previous UTC day and the header reads a day behind.
  const dayLabel = date.toLocaleDateString('en-NZ', { timeZone: NZ_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const shortDay = date.toLocaleDateString('en-NZ', { timeZone: NZ_TZ, weekday: 'short', day: 'numeric', month: 'short' })

  const revisions = pendingRevisions ?? []
  const shoots = (upcomingShoots ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
  const nextShoot = shoots[0]
  const overdueInvoices = xero && xero.overdue_invoice_count > 0
  const revenue = xero?.revenue_this_month_nzd ?? null
  const plural = (n: number) => (n !== 1 ? 's' : '')

  const weatherLine = weather
    ? ` &middot; ${weather.temp}&deg;C, ${weather.description.toLowerCase()} in Nelson`
    : ''

  // ── The hook: subject + hidden preview lead with the single most pressing thing.
  let subjectHook: string
  let focusFallback: string
  if (overdueInvoices) {
    subjectHook = `${xero!.overdue_invoice_count} invoice${plural(xero!.overdue_invoice_count)} overdue, ${fmtNZD(xero!.overdue_invoices_nzd)} to chase`
    focusFallback = `Chase the overdue invoices first. ${fmtNZD(xero!.overdue_invoices_nzd)} is still out there waiting to be collected.`
  } else if (revisions.length > 0) {
    subjectHook = `${revisions.length} client revision${plural(revisions.length)} waiting on you`
    focusFallback = `${revisions.length} client${plural(revisions.length)} waiting on revisions. Turn those around early and you will have happy clients by lunch.`
  } else if (nextShoot) {
    subjectHook = `Next shoot ${fmtShortDate(nextShoot.date)}: ${nextShoot.title}`
    focusFallback = `Your next shoot is ${nextShoot.title} on ${fmtShortDate(nextShoot.date)}. Sort the gear list and you are set.`
  } else if (revenue != null && revenue > 0) {
    subjectHook = `${fmtNZD(revenue)} in this month, and you are clear`
    focusFallback = `Nothing on fire today. Good chance to line up some shoots or push through a few edits.`
  } else {
    subjectHook = `A clear run today`
    focusFallback = `Nothing on fire today. Good chance to line up some shoots or push through a few edits.`
  }

  const focusText = (aiSummary && aiSummary.trim()) || focusFallback
  const focusHtml = esc(focusText).replace(/\n/g, '<br/>')
  const preheader = focusText.replace(/\s+/g, ' ').trim().slice(0, 140)

  // ── Focus — quiet and readable, not shouting. ─────────────────────────────────
  const focusCard = card('Focus for today',
    `<p style="color:#B8C3DA;font-size:15px;line-height:1.65;font-weight:400;margin:0;">${focusHtml}</p>`)

  // ── Money — one consolidated card: hero number + a clean 2-up grid of the rest. ─
  let moneyCard: string
  if (xero) {
    const metric = (label: string, value: string, accent?: string) => `
      <td width="50%" valign="top" style="padding:0 8px 4px 0;">
        <p style="color:#7A88A6;font-size:11px;margin:0 0 3px;">${label}</p>
        <p style="color:${accent || '#EFF2F8'};font-size:16px;font-weight:600;margin:0;">${value}</p>
      </td>`
    const cells: string[] = []
    if (xero.net_profit_this_month_nzd != null) cells.push(metric('Net profit', fmtNZD(xero.net_profit_this_month_nzd)))
    if (xero.bank_balance_nzd != null) cells.push(metric('Bank', fmtNZD(xero.bank_balance_nzd)))
    if (xero.outstanding_invoice_count > 0) cells.push(metric('Outstanding', `${fmtNZD(xero.outstanding_invoices_nzd)} · ${xero.outstanding_invoice_count}`))
    if (xero.overdue_invoice_count > 0) cells.push(metric('Overdue', `${fmtNZD(xero.overdue_invoices_nzd)} · ${xero.overdue_invoice_count}`, '#FF8A8A'))
    const rows: string[] = []
    for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`)
    const big = revenue != null
      ? `<p style="color:#EFF2F8;font-size:30px;font-weight:700;line-height:1;margin:0 0 4px;">${fmtNZD(revenue)}</p>
         <p style="color:#7A88A6;font-size:12px;margin:0 0 ${rows.length ? '20px' : '0'};">Revenue this month</p>`
      : ''
    const grid = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>` : ''
    moneyCard = card('Money', `${big}${grid}`)
  } else {
    moneyCard = card('Money', `<p style="color:#8996B2;font-size:15px;line-height:1.6;margin:0;">Connect Xero in settings to see live financials here.</p>`)
  }

  // ── Shoot calendar — a 14-day strip, booked days filled, today ringed. ────────
  const nzTodayStr = date.toLocaleDateString('en-CA', { timeZone: NZ_TZ }) // YYYY-MM-DD
  const [cy, cm, cd] = nzTodayStr.split('-').map(Number)
  const shootDates = new Set(shoots.map((s) => s.date))
  const weekRows: string[][] = [[], []]
  for (let i = 0; i < 14; i++) {
    const dt = new Date(Date.UTC(cy, cm - 1, cd + i))
    const iso = dt.toISOString().slice(0, 10)
    const wd = dt.toLocaleDateString('en-NZ', { timeZone: 'UTC', weekday: 'short' })
    const num = dt.getUTCDate()
    const booked = shootDates.has(iso)
    const isToday = i === 0
    const bg = booked ? '#6E9BF7' : '#111B33'
    const border = booked ? '#6E9BF7' : (isToday ? '#EFF2F8' : '#22304D')
    const wdColor = booked ? '#0A1428' : '#7A88A6'
    const numColor = booked ? '#0A1428' : '#B8C3DA'
    weekRows[Math.floor(i / 7)].push(`
      <td width="14.28%" align="center" valign="top" style="padding:3px;">
        <div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:9px 0;">
          <div style="color:${wdColor};font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;line-height:1;margin:0 0 5px;">${wd}</div>
          <div style="color:${numColor};font-size:15px;font-weight:700;line-height:1;">${num}</div>
        </div>
      </td>`)
  }
  const calGrid = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>${weekRows[0].join('')}</tr>
    <tr>${weekRows[1].join('')}</tr>
  </table>`
  const shootList = shoots.length
    ? shoots.slice(0, 4).map((s) =>
        `<p style="color:#8996B2;font-size:14px;line-height:1.5;margin:14px 0 0;"><span style="color:#EFF2F8;font-weight:600;">${fmtShortDate(s.date)}</span> &middot; ${esc(s.title)}${s.jobName ? ` <span style="color:#7A88A6;">${esc(s.jobName)}</span>` : ''}</p>`
      ).join('')
    : `<p style="color:#8996B2;font-size:14px;line-height:1.6;margin:16px 0 0;">No retainer shoots due in the next fortnight.</p>`
  const calendarCard = card('Retainer filming · next two weeks', `${calGrid}${shootList}`)

  // ── One news story — the day's most relevant thing in AI / creative tech. ─────
  const newsCard = news
    ? card('One to know', `
        <p style="color:#EFF2F8;font-size:16px;font-weight:600;line-height:1.4;margin:0 0 8px;">${esc(news.headline)}</p>
        <p style="color:#8996B2;font-size:14px;line-height:1.6;margin:0;">${esc(news.summary)}</p>
      `)
    : ''

  // ── Client revisions — actionable, kept as a tidy card. ───────────────────────
  const revisionsCard = revisions.length
    ? card('Client revisions pending', revisions.map((r) => {
        const who = r.clientName ? `<span style="color:#8996B2;font-size:13px;">${esc(r.clientName)}</span>` : ''
        const job = r.jobName ? `<span style="color:#EFF2F8;font-size:14px;font-weight:600;">${esc(r.jobName)}</span>` : ''
        const preview = r.request.length > 120 ? r.request.slice(0, 120) + '…' : r.request
        return `<div style="margin:0 0 14px;">
          <p style="margin:0 0 4px;">${job}${who ? ' &middot; ' : ''}${who} <span style="color:#7A88A6;font-size:12px;">Round ${r.round}</span></p>
          <p style="color:#8996B2;font-size:13px;line-height:1.5;margin:0;">${esc(preview)}</p>
        </div>`
      }).join(''))
    : ''

  const subject = `${subjectHook} · ${shortDay}`

  const html = wrap(`
    <h2 style="margin:0 0 4px;font-size:22px;color:#EFF2F8;font-weight:600;">Good morning Arlo,</h2>
    <p style="color:#7A88A6;font-size:14px;margin:0;">${dayLabel}${weatherLine}</p>
    ${focusCard}
    ${moneyCard}
    ${calendarCard}
    ${newsCard}
    ${revisionsCard}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
      <tr>
        <td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:999px;">
          <a href="https://dashboard.tuimedia.nz" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;">Open the dashboard</a>
        </td>
      </tr>
    </table>
  `, BRIEFING_SIGNOFF, preheader)

  await send({ to: 'hello@tuimedia.nz', subject, html, type: 'morning_briefing' })
}

const ADMIN_INBOX = 'hello@tuimedia.nz'

export async function sendAdminDeliveryViewedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Client viewed delivery — ${jobName}`
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#EFF2F8;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#EFF2F8;font-weight:600;">${clientName}</span> just opened the portal and viewed <span style="color:#EFF2F8;">${fileName}</span> for <span style="color:#EFF2F8;">${jobName}</span>.</p>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/jobs" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">Open dashboard</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_delivery_viewed', clientId, jobId })
}

export async function sendAdminFileDownloadedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Client downloaded a file — ${jobName}`
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#EFF2F8;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#EFF2F8;font-weight:600;">${clientName}</span> just downloaded <span style="color:#EFF2F8;">${fileName}</span> for <span style="color:#EFF2F8;">${jobName}</span>.</p>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/jobs" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">Open dashboard</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_file_downloaded', clientId, jobId })
}

export async function sendAdminDeliveryApprovedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Delivery approved — ${jobName}`
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#EFF2F8;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#EFF2F8;font-weight:600;">${clientName}</span> has approved <span style="color:#EFF2F8;">${fileName}</span> for <span style="color:#EFF2F8;">${jobName}</span>.</p>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/jobs" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">Open dashboard</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_delivery_approved', clientId, jobId })
}

export async function sendAdminRevisionRequestedEmail(clientName: string, jobName: string, round: number, request: string, jobId?: string, clientId?: string, revisionId?: string) {
  const subject = `Revision requested — ${jobName} (round ${round})`
  // Straight to the revision, not to the jobs list. The point of this email is
  // that you can answer it, and "Open dashboard" made you find the job, open
  // the right tab and scroll before you could.
  const revisionLink = jobId
    ? `${APP_URL}/dashboard/jobs/${jobId}?revision=${revisionId ?? ''}`
    : `${APP_URL}/dashboard/jobs`
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#EFF2F8;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#EFF2F8;font-weight:600;">${clientName}</span> has requested changes on <span style="color:#EFF2F8;">${jobName}</span> (round ${round}).</p>
    <div style="background:#0F1930;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#B8C3DA;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;">${request.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
    <div style="text-align:left;margin:24px 0;">
      <a href="${revisionLink}" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">Open and respond</a>
    </div>
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_revision_requested', clientId, jobId })
}

export async function sendAdminDocumentSignedEmail(clientName: string, docName: string, signature: string, signedAt: string, clientId?: string) {
  const subject = `Document signed — ${docName}`
  const safeSignature = signature.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = wrap(`
    <h2 style="margin:0 0 20px;font-size:22px;color:#EFF2F8;font-weight:600;">Kia ora Arlo,</h2>
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;"><span style="color:#EFF2F8;font-weight:600;">${clientName}</span> just signed <span style="color:#EFF2F8;">${docName}</span> on ${signedAt}.</p>
    <div style="background:#0F1930;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#8996B2;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.04em;">Signature</p>
      <p style="color:#EFF2F8;font-size:20px;line-height:1.3;margin:0;font-family:'Patrick Hand',cursive;">${safeSignature}</p>
    </div>
    <div style="text-align:left;margin:24px 0;">
      <a href="https://dashboard.tuimedia.nz/dashboard/documents" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">Open dashboard</a>
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
        <a href="${portalUrl}" target="_blank" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">View & Sign Document</a>
      </div>`
    : ''
  const html = wrap(`
    ${buildGreeting(clientName)}
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;">${intro}</p>
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

type LeadSummaryItem = {
  prospectName: string
  location: string
  category: string
  email: string | null
  subject: string
}

export async function sendLeadFinderEmail(leads: LeadSummaryItem[], date: Date) {
  const dayLabel = date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const leadsContent = leads.length === 0
    ? `<p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0;">No new leads found today.</p>`
    : leads.map((l, i) => `
        <div style="margin:0 0 20px;">
          <p style="color:#EFF2F8;font-size:15px;font-weight:600;margin:0 0 4px;">${i + 1}. ${l.prospectName}</p>
          <p style="color:#8996B2;font-size:13px;margin:0 0 4px;">${l.category}${l.location ? ` &mdash; ${l.location}` : ''}</p>
          <p style="color:#8996B2;font-size:13px;margin:0 0 4px;">To: <span style="color:${l.email ? '#EFF2F8' : '#7A88A6'};">${l.email || 'email not found'}</span></p>
          <p style="color:#8996B2;font-size:13px;margin:0;">Subject: ${l.subject}</p>
        </div>
      `).join('')

  const subject = `Kōtare — ${leads.length} new lead${leads.length !== 1 ? 's' : ''} found today`

  const html = wrap(`
    <h2 style="margin:0 0 4px;font-size:22px;color:#EFF2F8;font-weight:600;">Kōtare — Daily Leads</h2>
    <p style="color:#8996B2;font-size:14px;margin:0;">${dayLabel}</p>
    ${section(`${leads.length} New Lead${leads.length !== 1 ? 's' : ''} Found`, leadsContent)}
    ${section('', `<a href="https://dashboard.tuimedia.nz/dashboard/outreach" style="color:#EFF2F8;font-size:14px;text-decoration:underline;">Review drafts on dashboard &rarr;</a>`)}
  `, BRIEFING_SIGNOFF)

  await send({ to: 'hello@tuimedia.nz', subject, html, type: 'lead_finder' })
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
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;">Just a friendly nudge — I noticed you took a look at your project for <span style="color:#EFF2F8;">${jobName}</span> ${daysSinceViewed === 1 ? 'a day' : `${daysSinceViewed} days`} ago but haven't had a chance to come back to it yet.</p>
    <p style="color:#8996B2;font-size:15px;line-height:1.7;margin:0 0 16px;">No rush at all — whenever you're ready, you can approve it or send through any feedback right from the portal.</p>
    <div style="text-align:left;margin:28px 0;">
      <a href="${portalUrl}" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">Open Your Portal</a>
    </div>
    <p style="color:#8996B2;font-size:13px;margin:0;">If anything's unclear or you'd rather chat it through, just reply to <a href="mailto:hello@tuimedia.nz" style="color:#EFF2F8;text-decoration:underline;">hello@tuimedia.nz</a>.</p>
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

export async function sendClientAccountSetupEmail({
  to,
  clientName,
  setupUrl,
  clientId,
}: {
  to: string
  clientName: string
  setupUrl: string
  clientId?: string
}) {
  await send({
    to,
    subject: 'Set up your Tui Media account',
    type: 'account_setup',
    clientId,
    rethrow: true,
    html: wrap(
      `
      ${buildGreeting(clientName)}
      <p style="color:#B8C3DA;font-size:15px;line-height:1.6;margin:0 0 16px;">You now have your own login for the Tui Media portal — the place where your footage, photos and paperwork live. Everything that used to arrive as a one-off link is in one spot, and it stays there.</p>
      <p style="color:#B8C3DA;font-size:15px;line-height:1.6;margin:0 0 8px;">Choose a password to finish setting it up:</p>
      <div style="text-align:left;margin:28px 0;">
        <a href="${setupUrl}" style="display:inline-block;background:#6E9BF7;color:#0A1428;padding:11px 24px;border-radius:999px;text-decoration:none;font-weight:500;font-size:13px;">Choose a password</a>
      </div>
      <p style="color:#8996B2;font-size:13px;line-height:1.5;margin:0 0 16px;">This link is single-use and expires in 24 hours. If it has run out by the time you get to it, just reply and I'll send a fresh one.</p>
      <p style="color:#8996B2;font-size:13px;margin:0;">If the button doesn't work, copy this link: <a href="${setupUrl}" style="color:#EFF2F8;text-decoration:underline;">${setupUrl}</a></p>
    `,
      SIGNOFF,
      'Choose a password to finish setting up your portal.'
    ),
  })
}
