import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = process.env.EMAIL_FROM || 'Tui Media <noreply@dashboard.tuimedia.nz>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'

/* ── The rebrand palette, as literals ────────────────────────────────────────
   Email has no custom properties, so tuimedia.nz's tokens are spelled out here
   once and every template reads them from this one place. The names are the
   site's own so the two stay comparable when either moves.

     --paper   #060D1A   page ground
     --surface #0F1930   a card
     --ink     #EFF2F8   foreground text
     --muted   #8996B2   secondary text
     --accent  #6E9BF7   buttons, links, the one filled thing on a screen

   Surfaces carry NO border and NO drop shadow, and corner at --radius. That is
   the whole card treatment on the site, and it is now the whole card treatment
   here — these used to be a 1px #22304D hairline around every block, which is
   the one thing the site deliberately does not do. */
const C = {
  paper: '#060D1A',
  surface: '#0F1930',
  ink: '#EFF2F8',
  muted: '#8996B2',
  /* the site's --muted stepped one down, for labels and meta */
  faint: '#7A88A6',
  accent: '#6E9BF7',
  accentInk: '#0A1428',
  error: '#FF8A8A',
  /* the rule under a signoff. An alpha of --ink, as on the site. */
  rule: 'rgba(239, 242, 248, 0.13)',
  /* --radius / --radius-sm. Outlook drops these and squares the corner off,
     which is a fine floor to degrade to. */
  radius: '32px',
  radiusSm: '22px',
  pill: '999px',
} as const

/** The one filled button. Pill, accent fill, accent-ink label — as on the site. */
function button(href: string, label: string) {
  return `<div style="margin:28px 0 0;">
      <a href="${href}" style="display:inline-block;background:${C.accent};color:${C.accentInk};padding:13px 28px;border-radius:${C.pill};text-decoration:none;font-weight:600;font-size:14px;letter-spacing:-0.01em;">${label}</a>
    </div>`
}

/** The fallback line under a button, for clients that strip it. */
function plainLink(url: string) {
  return `<p style="color:${C.muted};font-size:13px;line-height:1.5;margin:16px 0 0;">If the button doesn't work, copy this link: <a href="${url}" style="color:${C.ink};text-decoration:underline;">${url}</a></p>`
}

/** A quoted block inside a card: the site's nested-panel treatment. */
function quote(label: string, text: string) {
  return `<div style="background:${C.surface};border-radius:${C.radiusSm};padding:18px 20px;margin:20px 0 0;">
      ${label ? `<p style="color:${C.faint};font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;margin:0 0 8px;">${label}</p>` : ''}
      <p style="color:${C.ink};font-size:14px;line-height:1.65;margin:0;white-space:pre-wrap;">${text}</p>
    </div>`
}

/** Escape anything that came from a client or the database. */
function esc(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
  <p style="color:${C.muted};font-size:15px;line-height:1.6;margin:36px 0 0;">Ng\u0101 mihi,<br/><span style="color:${C.ink};font-weight:600;">Arlo Radford</span></p>
`

const BRIEFING_SIGNOFF = `
  <p style="color:${C.ink};font-size:15px;font-weight:600;margin:36px 0 0;">Tui Media</p>
`

const NO_REPLY = `
  <div style="border-top:1px solid ${C.rule};margin-top:36px;padding-top:20px;">
    <p style="color:${C.faint};font-size:13px;line-height:1.55;margin:0;">This is an automated message, so there is no one at the other end of a reply. If you need to get in touch, email <a href="mailto:hello@tuimedia.nz" style="color:${C.ink};text-decoration:underline;">hello@tuimedia.nz</a></p>
  </div>
`

function wrap(body: string, signoff = SIGNOFF, preheader?: string) {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper};font-size:1px;line-height:1px;">${preheader}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>`
    : ''
  return `<!DOCTYPE html>
<html lang="en" style="background:${C.paper};margin:0;padding:0;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark only" />
    <meta name="supported-color-schemes" content="dark only" />
    <meta name="theme-color" content="${C.paper}" />
    <style>
      @font-face {
        font-family: 'Bricolage Grotesque';
        font-style: normal;
        font-weight: 200 800;
        font-display: swap;
        src: url(https://dashboard.tuimedia.nz/fonts/bricolage-grotesque-latin.woff2) format('woff2');
      }
      :root { color-scheme: dark only; supported-color-schemes: dark only; }
      html, body { background:${C.paper} !important; margin:0 !important; padding:0 !important; }
      body, table, td, div, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      @media (prefers-color-scheme: light) {
        html, body, .email-bg { background:${C.paper} !important; }
      }
      /* One breakpoint. The site's cards keep their radius on a phone and only
         lose padding, so these do the same rather than going full-bleed. */
      @media (max-width: 600px) {
        .gutter { padding-left:22px !important; padding-right:22px !important; }
        .card-pad { padding:20px !important; }
        .figure { font-size:26px !important; }
      }
    </style>
  </head>
  <body bgcolor="${C.paper}" style="background:${C.paper};margin:0;padding:0;font-family:'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;color:${C.ink};">
    ${preheaderHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" class="email-bg" style="background:${C.paper};width:100%;margin:0;padding:0;">
      <tr>
        <td align="center" bgcolor="${C.paper}" style="background:${C.paper};padding:48px 0;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper};width:100%;max-width:560px;margin:0 auto;">
            <tr>
              <td align="left" bgcolor="${C.paper}" class="gutter" style="background:${C.paper};padding:0 40px 36px;">
                <img src="https://dashboard.tuimedia.nz/Primary_White.png" alt="Tui Media" width="140" height="29" style="display:block;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td bgcolor="${C.paper}" class="gutter" style="background:${C.paper};padding:0 40px;">
                ${body}
                ${signoff}
                ${NO_REPLY}
              </td>
            </tr>
            <tr>
              <td align="left" bgcolor="${C.paper}" class="gutter" style="background:${C.paper};padding:28px 40px 0;color:#5F6E8C;font-size:12px;">
                &copy; ${new Date().getFullYear()} Tui Media &middot; <a href="https://tuimedia.nz" style="color:${C.faint};text-decoration:none;">www.tuimedia.nz</a>
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
    .map((p) => `<p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">${p}</p>`)
    .join('\n      ')
}

/* Headings sit at the site's own weight and tracking rather than a browser
   default: 500, tight letter-spacing, near-1 leading. */
function heading(text: string): string {
  return `<h2 style="margin:0 0 20px;font-size:26px;line-height:1.1;letter-spacing:-0.035em;color:${C.ink};font-weight:500;">${text}</h2>`
}

function buildGreeting(clientName?: string): string {
  const name = clientName ? ` ${esc(clientName)}` : ''
  return heading(`Kia ora${name},`)
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
      ${button(portalUrl, 'View your project')}
      ${plainLink(portalUrl)}
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
    ? quote('Note from Tui Media', esc(reply.trim()))
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
      ${button(proposalUrl, 'View the proposal')}
      ${plainLink(proposalUrl)}
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

export type WeeklyBriefingData = {
  /** The Monday the week starts on, in NZ time. */
  date: Date
  weather: { temp: number; description: string; windKph: number } | null
  xero?: XeroSummaryData | null
  pendingRevisions?: BriefingRevision[]
  upcomingShoots?: BriefingShoot[]
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
    <div style="border-top:1px solid ${C.rule};margin-top:28px;padding-top:20px;">
      <p style="color:${C.faint};font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;margin:0 0 14px;">${label}</p>
      ${content}
    </div>
  `
}

/* A card. Solid --surface, no border, no shadow, cornered at --radius — the
   same unit tuimedia.nz is built from, and now the same one the dashboard is.
   It used to carry a 1px #22304D hairline, which drew a box around every idea
   in the briefing and is the one thing the site's cards deliberately do not
   do. Neighbours are separated by the margin and the surface step. */
function card(label: string, content: string, pad = '24px 26px') {
  return `
    <div style="background:${C.surface};border-radius:${C.radius};padding:${pad};margin:16px 0 0;" class="card-pad">
      ${label ? `<p style="color:${C.faint};font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;margin:0 0 16px;">${label}</p>` : ''}
      ${content}
    </div>
  `
}

/**
 * The Monday briefing.
 *
 * This used to go out every morning at 7. Seven of these a week is six more
 * than there is news for: the money figures move monthly, the retainer
 * calendar is fixed weeks ahead, and a revision that is waiting on Monday is
 * still waiting on Tuesday. A daily mail that mostly repeats itself is a mail
 * that stops being read, which is the same failure that killed the daily
 * Telegram digest (see CRONS.md).
 *
 * So it is once a week, and it is written to set the week up rather than
 * report the morning: the shoot calendar leads with the seven days you are
 * about to work, the focus line is asked for the week's priority, and money is
 * a position rather than a movement.
 */
export function renderWeeklyBriefing(data: WeeklyBriefingData): { subject: string; html: string } {
  const { date, weather, xero, pendingRevisions, upcomingShoots, aiSummary } = data

  // Format in NZ time — the cron runs on UTC, so at 7am NZ an un-zoned
  // formatter renders the previous UTC day and the header reads a day behind.
  const dayLabel = date.toLocaleDateString('en-NZ', { timeZone: NZ_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const shortDay = date.toLocaleDateString('en-NZ', { timeZone: NZ_TZ, day: 'numeric', month: 'short' })

  const revisions = pendingRevisions ?? []
  const shoots = (upcomingShoots ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
  const nextShoot = shoots[0]
  const overdueInvoices = xero && xero.overdue_invoice_count > 0
  const revenue = xero?.revenue_this_month_nzd ?? null
  const plural = (n: number) => (n !== 1 ? 's' : '')

  const weatherLine = weather
    ? ` &middot; ${weather.temp}&deg;C, ${weather.description.toLowerCase()} in Nelson`
    : ''

  // ── The hook: subject + hidden preview lead with the week's single most
  //    pressing thing, in the order it would cost you the most to miss.
  let subjectHook: string
  let focusFallback: string
  if (overdueInvoices) {
    subjectHook = `${xero!.overdue_invoice_count} invoice${plural(xero!.overdue_invoice_count)} overdue, ${fmtNZD(xero!.overdue_invoices_nzd)} to chase`
    focusFallback = `Start the week on the overdue invoices. ${fmtNZD(xero!.overdue_invoices_nzd)} is still out there, and it does not get easier to ask for the longer it sits.`
  } else if (revisions.length > 0) {
    subjectHook = `${revisions.length} client revision${plural(revisions.length)} waiting on you`
    focusFallback = `${revisions.length} client${plural(revisions.length)} waiting on revisions. Clear those on Monday and the rest of the week is yours.`
  } else if (nextShoot) {
    subjectHook = `First shoot ${fmtShortDate(nextShoot.date)}: ${nextShoot.title}`
    focusFallback = `First shoot of the week is ${nextShoot.title} on ${fmtShortDate(nextShoot.date)}. Get the gear and the shot list sorted before it lands on you.`
  } else if (revenue != null && revenue > 0) {
    subjectHook = `${fmtNZD(revenue)} in this month, and the week is clear`
    focusFallback = `Nothing forced on you this week. That is the week to line up shoots and get ahead on edits rather than let it fill itself.`
  } else {
    subjectHook = `A clear week ahead`
    focusFallback = `Nothing forced on you this week. That is the week to line up shoots and get ahead on edits rather than let it fill itself.`
  }

  const focusText = (aiSummary && aiSummary.trim()) || focusFallback
  const focusHtml = esc(focusText).replace(/\n/g, '<br/>')
  const preheader = focusText.replace(/\s+/g, ' ').trim().slice(0, 140)

  // ── Focus — quiet and readable, not shouting. ─────────────────────────────
  const focusCard = card('Focus for the week',
    `<p style="color:${C.ink};font-size:15px;line-height:1.65;font-weight:400;margin:0;">${focusHtml}</p>`)

  // ── Money — one card: hero number, then a clean 2-up grid of the rest. ────
  let moneyCard: string
  if (xero) {
    const metric = (label: string, value: string, accent?: string) => `
      <td width="50%" valign="top" style="padding:0 8px 10px 0;">
        <p style="color:${C.faint};font-size:11px;margin:0 0 4px;">${label}</p>
        <p style="color:${accent || C.ink};font-size:17px;font-weight:600;letter-spacing:-0.02em;margin:0;">${value}</p>
      </td>`
    const cells: string[] = []
    if (xero.net_profit_this_month_nzd != null) cells.push(metric('Net profit', fmtNZD(xero.net_profit_this_month_nzd)))
    if (xero.bank_balance_nzd != null) cells.push(metric('Bank', fmtNZD(xero.bank_balance_nzd)))
    if (xero.outstanding_invoice_count > 0) cells.push(metric('Outstanding', `${fmtNZD(xero.outstanding_invoices_nzd)} · ${xero.outstanding_invoice_count}`))
    if (xero.overdue_invoice_count > 0) cells.push(metric('Overdue', `${fmtNZD(xero.overdue_invoices_nzd)} · ${xero.overdue_invoice_count}`, C.error))
    const rows: string[] = []
    for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`)
    const big = revenue != null
      ? `<p class="figure" style="color:${C.ink};font-size:32px;font-weight:500;letter-spacing:-0.035em;line-height:1;margin:0 0 6px;">${fmtNZD(revenue)}</p>
         <p style="color:${C.faint};font-size:12px;margin:0 0 ${rows.length ? '22px' : '0'};">Revenue this month</p>`
      : ''
    const grid = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>` : ''
    moneyCard = card('Money', `${big}${grid}`)
  } else {
    moneyCard = card('Money', `<p style="color:${C.muted};font-size:15px;line-height:1.6;margin:0;">Connect Xero in settings to see live financials here.</p>`)
  }

  // ── The week's shoot calendar ─────────────────────────────────────────────
  // Seven days from this Monday, booked days filled, today ringed. It used to
  // be a fortnight because the mail arrived daily and a rolling window was the
  // only way to see past tomorrow. Weekly, the week itself is the unit: this
  // is the seven days being set up, not a rolling horizon.
  const nzTodayStr = date.toLocaleDateString('en-CA', { timeZone: NZ_TZ }) // YYYY-MM-DD
  const [cy, cm, cd] = nzTodayStr.split('-').map(Number)
  const shootDates = new Set(shoots.map((s) => s.date))
  const cells: string[] = []
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(cy, cm - 1, cd + i))
    const iso = dt.toISOString().slice(0, 10)
    const wd = dt.toLocaleDateString('en-NZ', { timeZone: 'UTC', weekday: 'short' })
    const num = dt.getUTCDate()
    const booked = shootDates.has(iso)
    const isToday = i === 0
    const bg = booked ? C.accent : C.paper
    const wdColor = booked ? C.accentInk : C.faint
    const numColor = booked ? C.accentInk : (isToday ? C.ink : C.muted)
    cells.push(`
      <td width="14.28%" align="center" valign="top" style="padding:3px;">
        <div style="background:${bg};border-radius:${C.radiusSm};padding:11px 0;">
          <div style="color:${wdColor};font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;line-height:1;margin:0 0 6px;">${wd}</div>
          <div style="color:${numColor};font-size:16px;font-weight:600;letter-spacing:-0.02em;line-height:1;">${num}</div>
        </div>
      </td>`)
  }
  const calGrid = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells.join('')}</tr></table>`

  // Only this week's shoots are listed under the strip — anything beyond
  // Sunday belongs to next Monday's mail, not this one.
  const weekEndISO = new Date(Date.UTC(cy, cm - 1, cd + 6)).toISOString().slice(0, 10)
  const thisWeek = shoots.filter((s) => s.date <= weekEndISO)
  const later = shoots.filter((s) => s.date > weekEndISO)

  const shootList = thisWeek.length
    ? thisWeek.map((s) =>
        `<p style="color:${C.muted};font-size:14px;line-height:1.5;margin:14px 0 0;"><span style="color:${C.ink};font-weight:600;">${fmtShortDate(s.date)}</span> &middot; ${esc(s.title)}${s.jobName ? ` <span style="color:${C.faint};">${esc(s.jobName)}</span>` : ''}</p>`
      ).join('')
    : `<p style="color:${C.muted};font-size:14px;line-height:1.6;margin:18px 0 0;">No retainer shoots due this week.</p>`

  const nextUp = later.length
    ? `<p style="color:${C.faint};font-size:13px;line-height:1.5;margin:16px 0 0;">Next week: ${later.slice(0, 3).map((s) => `${esc(s.title)} ${fmtShortDate(s.date)}`).join(' · ')}</p>`
    : ''

  const calendarCard = card('Retainer filming · this week', `${calGrid}${shootList}${nextUp}`)

  // ── Client revisions — actionable, kept as a tidy card. ───────────────────
  const revisionsCard = revisions.length
    ? card('Client revisions pending', revisions.map((r) => {
        const who = r.clientName ? `<span style="color:${C.muted};font-size:13px;">${esc(r.clientName)}</span>` : ''
        const job = r.jobName ? `<span style="color:${C.ink};font-size:14px;font-weight:600;">${esc(r.jobName)}</span>` : ''
        const preview = r.request.length > 120 ? r.request.slice(0, 120) + '…' : r.request
        return `<div style="margin:0 0 16px;">
          <p style="margin:0 0 5px;">${job}${who ? ' &middot; ' : ''}${who} <span style="color:${C.faint};font-size:12px;">Round ${r.round}</span></p>
          <p style="color:${C.muted};font-size:13px;line-height:1.55;margin:0;">${esc(preview)}</p>
        </div>`
      }).join(''))
    : ''

  const subject = `Your week · ${subjectHook} · ${shortDay}`

  const html = wrap(`
    ${heading('Kia ora Arlo, here is your week.')}
    <p style="color:${C.faint};font-size:14px;margin:0;">Week beginning ${dayLabel}${weatherLine}</p>
    ${focusCard}
    ${calendarCard}
    ${moneyCard}
    ${revisionsCard}
    ${button('https://dashboard.tuimedia.nz', 'Open the dashboard')}
  `, BRIEFING_SIGNOFF, preheader)

  return { subject, html }
}

/** Build it and send it. Split so the render can be checked without mailing. */
export async function sendWeeklyBriefingEmail(data: WeeklyBriefingData) {
  const { subject, html } = renderWeeklyBriefing(data)
  await send({ to: 'hello@tuimedia.nz', subject, html, type: 'weekly_briefing' })
}

const ADMIN_INBOX = 'hello@tuimedia.nz'

export async function sendAdminDeliveryViewedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Client viewed delivery — ${jobName}`
  const html = wrap(`
    ${heading('Kia ora Arlo,')}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;"><span style="color:${C.ink};font-weight:600;">${esc(clientName)}</span> just opened the portal and viewed <span style="color:${C.ink};">${esc(fileName)}</span> for <span style="color:${C.ink};">${esc(jobName)}</span>.</p>
    ${button('https://dashboard.tuimedia.nz/dashboard/jobs', 'Open the dashboard')}
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_delivery_viewed', clientId, jobId })
}

export async function sendAdminFileDownloadedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Client downloaded a file — ${jobName}`
  const html = wrap(`
    ${heading('Kia ora Arlo,')}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;"><span style="color:${C.ink};font-weight:600;">${esc(clientName)}</span> just downloaded <span style="color:${C.ink};">${esc(fileName)}</span> for <span style="color:${C.ink};">${esc(jobName)}</span>.</p>
    ${button('https://dashboard.tuimedia.nz/dashboard/jobs', 'Open the dashboard')}
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_file_downloaded', clientId, jobId })
}

export async function sendAdminDeliveryApprovedEmail(clientName: string, jobName: string, fileName: string, jobId?: string, clientId?: string) {
  const subject = `Delivery approved — ${jobName}`
  const html = wrap(`
    ${heading('Kia ora Arlo,')}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;"><span style="color:${C.ink};font-weight:600;">${esc(clientName)}</span> has approved <span style="color:${C.ink};">${esc(fileName)}</span> for <span style="color:${C.ink};">${esc(jobName)}</span>.</p>
    ${button('https://dashboard.tuimedia.nz/dashboard/jobs', 'Open the dashboard')}
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
    ${heading('Kia ora Arlo,')}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;"><span style="color:${C.ink};font-weight:600;">${esc(clientName)}</span> has requested changes on <span style="color:${C.ink};">${esc(jobName)}</span> (round ${round}).</p>
    ${quote('What they asked for', esc(request))}
    ${button(revisionLink, 'Open and respond')}
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_revision_requested', clientId, jobId })
}

export async function sendAdminDocumentSignedEmail(clientName: string, docName: string, signature: string, signedAt: string, clientId?: string) {
  const subject = `Document signed — ${docName}`
  const safeSignature = signature.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = wrap(`
    ${heading('Kia ora Arlo,')}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;"><span style="color:${C.ink};font-weight:600;">${esc(clientName)}</span> just signed <span style="color:${C.ink};">${esc(docName)}</span> on ${signedAt}.</p>
    <div style="background:${C.surface};border-radius:${C.radius};padding:24px 26px;margin:20px 0 0;" class="card-pad">
      <p style="color:${C.faint};font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;margin:0 0 10px;">Signature</p>
      <p style="color:${C.ink};font-size:22px;line-height:1.3;margin:0;font-family:'Patrick Hand',cursive;">${safeSignature}</p>
    </div>
    ${button('https://dashboard.tuimedia.nz/dashboard/documents', 'Open the dashboard')}
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
  const buttonSection = portalUrl ? button(portalUrl, 'View and sign the document') : ''
  const html = wrap(`
    ${buildGreeting(clientName)}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">${intro}</p>
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
    ? `<p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">No new leads found today.</p>`
    : leads.map((l, i) => `
        <div style="margin:0 0 20px;">
          <p style="color:${C.ink};font-size:15px;font-weight:600;margin:0 0 4px;">${i + 1}. ${esc(l.prospectName)}</p>
          <p style="color:${C.muted};font-size:13px;margin:0 0 4px;">${esc(l.category)}${l.location ? ` &mdash; ${esc(l.location)}` : ''}</p>
          <p style="color:${C.muted};font-size:13px;margin:0 0 4px;">To: <span style="color:${l.email ? C.ink : C.faint};">${esc(l.email || 'email not found')}</span></p>
          <p style="color:${C.muted};font-size:13px;margin:0;">Subject: ${esc(l.subject)}</p>
        </div>
      `).join('')

  const subject = `Kōtare — ${leads.length} new lead${leads.length !== 1 ? 's' : ''} found today`

  const html = wrap(`
    ${heading('Kōtare, daily leads')}
    <p style="color:${C.faint};font-size:14px;margin:0;">${dayLabel}</p>
    ${section(`${leads.length} New Lead${leads.length !== 1 ? 's' : ''} Found`, leadsContent)}
    ${button('https://dashboard.tuimedia.nz/dashboard/outreach', 'Review the drafts')}
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
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">Just a nudge. You had a look at your project for <span style="color:${C.ink};">${esc(jobName)}</span> ${daysSinceViewed === 1 ? 'a day' : `${daysSinceViewed} days`} ago and haven't had a chance to come back to it yet.</p>
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">No rush at all. Whenever you're ready, you can approve it or send through any feedback straight from the portal.</p>
    ${button(portalUrl, 'Open your portal')}
    <p style="color:${C.muted};font-size:13px;line-height:1.5;margin:16px 0 0;">If anything's unclear or you'd rather talk it through, email <a href="mailto:hello@tuimedia.nz" style="color:${C.ink};text-decoration:underline;">hello@tuimedia.nz</a>.</p>
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
      <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">You now have your own login for the Tui Media portal, the place where your footage, photos and paperwork live. Everything that used to arrive as a one-off link is in one spot, and it stays there.</p>
      <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">Choose a password to finish setting it up.</p>
      ${button(setupUrl, 'Choose a password')}
      <p style="color:${C.faint};font-size:13px;line-height:1.55;margin:16px 0 0;">This link is single use and expires in 24 hours. If it has run out by the time you get to it, email hello@tuimedia.nz and I'll send a fresh one.</p>
      ${plainLink(setupUrl)}
    `,
      SIGNOFF,
      'Choose a password to finish setting up your portal.'
    ),
  })
}
