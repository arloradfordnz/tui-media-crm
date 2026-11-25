import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { brandIdentity, portalAuthHref, resolveBrand, type BrandIdentity } from '@/lib/brand'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = process.env.EMAIL_FROM || 'Tui Media <noreply@dashboard.tuimedia.nz>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'

/* The sending ADDRESS never changes (it is the verified Resend domain); only
   the display name in front of it follows the client's brand. */
const FROM_ADDRESS = /<([^>]+)>/.exec(FROM)?.[1] ?? FROM
function fromFor(id: BrandIdentity) {
  return id.brand === 'tui_media' ? FROM : `${id.senderName} <${FROM_ADDRESS}>`
}

/* Emails Arlo gets himself (briefing, admin alerts) are always Tui Media. */
const TUI = brandIdentity('tui_media')

/** A client email's subject or body, written once for either brand. */
type Branded = string | ((id: BrandIdentity) => string)

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

/* The heading's layout, shared with the Arlo Radford shell, which swaps it. */
const HEADING_STYLE = 'margin:0 0 20px;font-size:26px;line-height:1.1;letter-spacing:-0.035em;'

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

/**
 * Which brand a client email goes out under. An explicit brand wins; else the
 * job's brand if it has one, else its client's; else the client's. One small
 * query, and only for emails that are written per brand.
 */
async function lookupBrand(clientId?: string, jobId?: string): Promise<BrandIdentity> {
  try {
    const supabase = getLogClient()
    if (!supabase || (!clientId && !jobId)) return TUI
    if (jobId) {
      const { data } = await supabase.from('jobs').select('brand, clients(brand)').eq('id', jobId).maybeSingle()
      const client = (Array.isArray(data?.clients) ? data?.clients[0] : data?.clients) as { brand?: string | null } | null | undefined
      if (data) return brandIdentity(resolveBrand(data.brand as string | null, client?.brand))
    }
    if (clientId) {
      const { data } = await supabase.from('clients').select('brand').eq('id', clientId).maybeSingle()
      return brandIdentity(data?.brand as string | null)
    }
  } catch (err) {
    console.error('[email brand lookup]', err)
  }
  return TUI
}

async function send({
  to,
  subject: subjectIn,
  html: htmlIn,
  type,
  clientId,
  jobId,
  brand,
  attachments,
  rethrow,
}: {
  to: string
  subject: Branded
  html: Branded
  type: string
  clientId?: string
  jobId?: string
  /** The client's (or job's) brand, when the caller already has it. */
  brand?: string | null
  attachments?: { filename: string; content: string }[]
  rethrow?: boolean
}) {
  const branded = typeof subjectIn === 'function' || typeof htmlIn === 'function'
  const id = !branded ? TUI : brand !== undefined ? brandIdentity(brand) : await lookupBrand(clientId, jobId)
  const subject = typeof subjectIn === 'function' ? subjectIn(id) : subjectIn
  const html = typeof htmlIn === 'function' ? htmlIn(id) : htmlIn
  if (!resend) {
    console.log(`[email skipped] No RESEND_API_KEY — would have sent to ${to}: ${subject}`)
    await logEmail({ to, subject, type, status: 'failed', error: 'No RESEND_API_KEY configured', clientId, jobId })
    if (rethrow) throw new Error('Email not configured — RESEND_API_KEY is missing.')
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = { from: fromFor(id), to, subject, html }
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

function signoff(id: BrandIdentity) {
  return `
  <p style="color:${C.muted};font-size:15px;line-height:1.6;margin:36px 0 0;">${id.signoff}<br/><span style="color:${C.ink};font-weight:600;">${id.signatureName}</span></p>
`
}
const SIGNOFF = signoff(TUI)

const BRIEFING_SIGNOFF = `
  <p style="color:${C.ink};font-size:15px;font-weight:600;margin:36px 0 0;">Tui Media</p>
`

const NO_REPLY = `
  <div style="border-top:1px solid ${C.rule};margin-top:36px;padding-top:20px;">
    <p style="color:${C.faint};font-size:13px;line-height:1.55;margin:0;">This is an automated message, so there is no one at the other end of a reply. If you need to get in touch, email <a href="mailto:hello@tuimedia.nz" style="color:${C.ink};text-decoration:underline;">hello@tuimedia.nz</a></p>
  </div>
`

/* The logo in the header, at the same height either way. */
function headerLogo(id: BrandIdentity) {
  /* Same 140px width as Tui Media's lockup; the wordmark is wider, so shorter. */
  const w = 140
  const hh = id.brand === 'tui_media' ? 29 : Math.round((w * id.logo.height) / id.logo.width)
  return `<img src="https://dashboard.tuimedia.nz${id.logo.onDark}" alt="${id.displayName}" width="${w}" height="${hh}" style="display:block;border:0;outline:none;text-decoration:none;" />`
}

/** The one plain invoicing line, for brands whose invoices carry another name. */
function invoiceLine(id: BrandIdentity) {
  return id.invoiceNote
    ? `<p style="color:${C.muted};font-size:15px;line-height:1.7;margin:16px 0 0;">${id.invoiceNote}</p>`
    : ''
}

function wrap(body: string, signoff = SIGNOFF, preheader?: string, id: BrandIdentity = TUI) {
  if (id.brand === 'arlo_radford') return wrapArloRadford(body, signoff, preheader)
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
                ${headerLogo(id)}
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
                &copy; ${new Date().getFullYear()} ${id.displayName} &middot; <a href="${id.websiteUrl}" style="color:${C.faint};text-decoration:none;">${id.website}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/* ── Arlo Radford ─────────────────────────────────────────────────────────────
   An Arlo Radford client's email looks like arloradford.nz: paper and ink,
   Gambetta for the heading, General Sans for the rest, a square ink button
   and the site's ink footer band with the wordmark. Tui Media's emails are
   untouched by any of this.

   The templates are written once, in Tui Media's palette (C). Rather than
   thread a second palette through every template, the Arlo Radford shell
   swaps C's literals for the site's on the finished body, along with the
   corner radii, the button's weight and the heading face. Every colour in a
   client email comes from C, so the swap is complete; a template that adds a
   colour should add it to C. */
const AR = {
  paper: '#F6F4F0',
  surface: '#ECE9E3',
  ink: '#111111',
  muted: '#4F4F4F',
  faint: '#6E6C68',
  mutedOnDark: '#9A9A9A',
  rule: 'rgba(17, 17, 17, 0.16)',
  display: "Gambetta,Georgia,'Times New Roman',serif",
  sans: "'General Sans','Helvetica Neue',Helvetica,Arial,sans-serif",
} as const

const AR_SWAP: Record<string, string> = {
  [C.paper]: AR.paper,
  [C.surface]: AR.surface,
  [C.ink]: AR.ink,
  [C.muted]: AR.muted,
  [C.faint]: AR.faint,
  [C.accent]: AR.ink,
  [C.accentInk]: AR.paper,
  [C.error]: '#A3392D',
  [C.rule]: AR.rule,
  [`border-radius:${C.pill}`]: 'border-radius:0',
  [`border-radius:${C.radius}`]: 'border-radius:0',
  [`border-radius:${C.radiusSm}`]: 'border-radius:0',
  /* the button's label: the site's 500, untracked */
  'font-weight:600;font-size:14px;letter-spacing:-0.01em;': 'font-weight:500;font-size:14px;letter-spacing:0;',
  [HEADING_STYLE]: `margin:0 0 22px;font-family:${AR.display};font-size:32px;line-height:1.1;letter-spacing:-0.02em;`,
}
const AR_SWAP_RE = new RegExp(
  Object.keys(AR_SWAP).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g',
)
function toArloRadford(html: string) {
  return html.replace(AR_SWAP_RE, (m) => AR_SWAP[m] ?? m)
}

function wrapArloRadford(body: string, signoff: string, preheader?: string) {
  const id = brandIdentity('arlo_radford')
  const ASSETS = 'https://dashboard.tuimedia.nz'
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${AR.paper};font-size:1px;line-height:1px;">${preheader}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>`
    : ''
  const logoW = 150
  const logoH = Math.round((logoW * id.logo.height) / id.logo.width)
  const footW = 180
  const footH = Math.round((footW * id.logo.height) / id.logo.width)
  return `<!DOCTYPE html>
<html lang="en" style="background:${AR.paper};margin:0;padding:0;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <meta name="theme-color" content="${AR.paper}" />
    <style>
      @font-face { font-family:'General Sans'; font-style:normal; font-weight:400; font-display:swap; src:url(${ASSETS}/fonts/arlo-radford/general-sans-400.woff2) format('woff2'); }
      @font-face { font-family:'General Sans'; font-style:normal; font-weight:500; font-display:swap; src:url(${ASSETS}/fonts/arlo-radford/general-sans-500.woff2) format('woff2'); }
      @font-face { font-family:'Gambetta'; font-style:normal; font-weight:500; font-display:swap; src:url(${ASSETS}/fonts/arlo-radford/gambetta-500.woff2) format('woff2'); }
      @font-face { font-family:'Gambetta'; font-style:italic; font-weight:500; font-display:swap; src:url(${ASSETS}/fonts/arlo-radford/gambetta-500-italic.woff2) format('woff2'); }
      :root { color-scheme: light only; supported-color-schemes: light only; }
      html, body { background:${AR.paper} !important; margin:0 !important; padding:0 !important; }
      body, table, td, div, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      @media (max-width: 600px) {
        .gutter { padding-left:22px !important; padding-right:22px !important; }
      }
    </style>
  </head>
  <body bgcolor="${AR.paper}" style="background:${AR.paper};margin:0;padding:0;font-family:${AR.sans};color:${AR.ink};">
    ${preheaderHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${AR.paper}" style="background:${AR.paper};width:100%;margin:0;padding:0;">
      <tr>
        <td align="center" bgcolor="${AR.paper}" style="background:${AR.paper};padding:40px 0 56px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;">
            <tr>
              <td align="left" class="gutter" style="padding:0 40px 44px;">
                <a href="${id.websiteUrl}" style="text-decoration:none;"><img src="${ASSETS}${id.logo.onLight}" alt="${id.displayName}" width="${logoW}" height="${logoH}" style="display:block;border:0;outline:none;text-decoration:none;" /></a>
              </td>
            </tr>
            <tr>
              <td class="gutter" style="padding:0 40px;font-family:${AR.sans};">
                ${toArloRadford(`${body}${signoff}${NO_REPLY}`)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" bgcolor="${AR.ink}" style="background:${AR.ink};padding:44px 24px 36px;font-family:${AR.sans};">
          <a href="${id.websiteUrl}" style="text-decoration:none;"><img src="${ASSETS}${id.logo.onDark}" alt="${id.displayName}" width="${footW}" height="${footH}" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" /></a>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;">
            <a href="${id.websiteUrl}" style="color:${AR.paper};text-decoration:none;">${id.website}</a>
            <span style="color:${AR.mutedOnDark};">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>
            <a href="https://www.instagram.com/arloradford" style="color:${AR.paper};text-decoration:none;">Instagram</a>
          </p>
          <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:${AR.mutedOnDark};">&copy; ${new Date().getFullYear()} Arlo Radford &middot; Nelson, New Zealand</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// --- Templates ---
// Written in Arlo's voice (short, plain, first names, no hype). Edit them here.
// Placeholders: {{clientName}} {{jobName}} {{round}} {{portalUrl}} {{proposalUrl}}

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  welcome: {
    subject: 'Welcome to {{brandName}}',
    body: "Good to have you on board. I'll be in touch shortly to chat through your project and next steps.\n\nIf you've got any questions before then, just reply to hello@tuimedia.nz.",
  },
  proposal: {
    subject: 'Proposal for {{jobName}}',
    body: "I've put together a proposal for {{jobName}}. It's all in the link below, including pricing and what's covered.\n\nLet me know if you want to tweak anything.",
  },
  proposal_accepted: {
    subject: 'Proposal accepted: {{jobName}}',
    body: '{{clientName}} has accepted the proposal for {{jobName}}.\n\nThe job has been moved to Booked.',
  },
  delivery: {
    subject: '{{jobName}} is ready to review',
    body: "{{jobName}} is ready for you to watch. The link below has everything.\n\nLet me know what you think, and if anything needs changing just request a revision there.",
  },
  revision: {
    subject: 'Got your revisions for {{jobName}}',
    body: "Thanks, I've got your revision request (round {{round}}) for {{jobName}}.\n\nI'll get onto the changes and send an updated version through.",
  },
  approval: {
    subject: '{{jobName}} approved',
    body: "Awesome, thanks for approving {{jobName}}. Glad you're happy with it.\n\nI'll get your final files sorted and send them through shortly.",
  },
  revision_accepted: {
    subject: 'Revisions underway for {{jobName}}',
    body: "Your revision request (round {{round}}) for {{jobName}} is accepted and I'm onto it now.\n\nI'll send the updated version as soon as it's ready.",
  },
  revision_declined: {
    subject: 'About your revisions for {{jobName}}',
    body: "I've been through your revision request (round {{round}}) for {{jobName}}. Some of it falls outside what's covered in this round, so I can't make those changes as part of it.\n\nHappy to chat it through, or I can quote the extras separately. Let me know.",
  },
  revision_reply: {
    subject: 'A note on your revisions for {{jobName}}',
    body: "I've left a note on your revision request (round {{round}}) for {{jobName}}. See below.",
  },
}

// --- Template helpers ---

function getTemplate(type: string): { subject: string; body: string } {
  return TEMPLATES[type] || { subject: '', body: '' }
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
  return `<h2 style="${HEADING_STYLE}color:${C.ink};font-weight:500;">${text}</h2>`
}

function buildGreeting(clientName?: string, id: BrandIdentity = TUI): string {
  /* arloradford.nz sets the accent word in italic ("Kia ora, <em>Sam</em>"). */
  if (id.brand === 'arlo_radford' && clientName) return heading(`Kia ora <em style="font-style:italic;">${esc(clientName)}</em>,`)
  return heading(id.greeting(clientName ? esc(clientName) : null))
}

/* A client email in the client's brand: logo, footer, sign-off. */
function wrapFor(id: BrandIdentity, body: string, preheader?: string) {
  return wrap(body, signoff(id), preheader, id)
}

// --- Email functions ---

export async function sendPortalDeliveryEmail(to: string, clientName: string, jobName: string, portalUrl: string, clientId?: string, jobId?: string, brand?: string | null) {
  const tpl = getTemplate('delivery')
  const vars = { clientName, jobName, portalUrl }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    brand,
    type: 'delivery',
    clientId,
    jobId,
    html: (id) => wrapFor(id, `
      ${buildGreeting(clientName, id)}
      ${bodyToHtml(bodyText)}
      ${button(portalUrl, 'View your project')}
      ${plainLink(portalUrl)}
    `),
  })
}

export async function sendApprovalConfirmationEmail(to: string, clientName: string, jobName: string, clientId?: string, jobId?: string, brand?: string | null) {
  const tpl = getTemplate('approval')
  const vars = { clientName, jobName }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    brand,
    type: 'approval',
    clientId,
    jobId,
    html: (id) => wrapFor(id, `
      ${buildGreeting(clientName, id)}
      ${bodyToHtml(bodyText)}
    `),
  })
}

export async function sendRevisionRequestEmail(to: string, clientName: string, jobName: string, round: number, clientId?: string, jobId?: string, brand?: string | null) {
  const tpl = getTemplate('revision')
  const vars = { clientName, jobName, round: String(round) }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    brand,
    type: 'revision',
    clientId,
    jobId,
    html: (id) => wrapFor(id, `
      ${buildGreeting(clientName, id)}
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
  brand?: string | null,
) {
  const type = response === 'reply' ? 'revision_reply' : `revision_${response}`
  const tpl = getTemplate(type)
  const vars = { clientName, jobName, round: String(round) }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  const replyBlock = (id: BrandIdentity) => reply?.trim()
    ? quote(`Note from ${id.shortName}`, esc(reply.trim()))
    : ''

  await send({
    to,
    subject,
    type,
    clientId,
    jobId,
    brand,
    html: (id) => wrapFor(id, `
      ${buildGreeting(clientName, id)}
      ${bodyToHtml(bodyText)}
      ${replyBlock(id)}
    `),
  })
}

export async function sendProposalEmail(to: string, clientName: string, jobName: string, proposalUrl: string, clientId?: string, jobId?: string, brand?: string | null) {
  const tpl = getTemplate('proposal')
  const vars = { clientName, jobName, proposalUrl }
  const subject = replacePlaceholders(tpl.subject, vars)
  const bodyText = replacePlaceholders(tpl.body, vars)

  await send({
    to,
    subject,
    brand,
    type: 'proposal',
    clientId,
    jobId,
    html: (id) => wrapFor(id, `
      ${buildGreeting(clientName, id)}
      ${bodyToHtml(bodyText)}
      ${invoiceLine(id)}
      ${button(proposalUrl, 'View the proposal')}
      ${plainLink(proposalUrl)}
    `),
  })
}

export async function sendWelcomeEmail(to: string, clientName: string, clientId?: string, brand?: string | null) {
  const tpl = getTemplate('welcome')
  await send({
    to,
    subject: (id) => replacePlaceholders(tpl.subject, { clientName, brandName: id.displayName }),
    brand,
    type: 'welcome',
    clientId,
    html: (id) => wrapFor(id, `
      ${buildGreeting(clientName, id)}
      ${bodyToHtml(replacePlaceholders(tpl.body, { clientName, brandName: id.displayName }))}
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
    subjectHook = `${fmtNZD(revenue)} paid in this month, and the week is clear`
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
         <p style="color:${C.faint};font-size:12px;margin:0 0 ${rows.length ? '22px' : '0'};">Paid this month</p>`
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

// To the client's marketing person, not the client. The one who approves the
// cut is often not the one who posts it (Sam at Johnson Residential), so the
// finished file goes straight to whoever does, instead of waiting on a forward.
export async function sendApprovedVideoToMarketingEmail({
  to, clientName, approverName, jobName, fileName, shareUrl, clientId, jobId, brand,
}: {
  to: string
  clientName: string
  approverName: string | null
  jobName: string
  fileName: string
  shareUrl: string
  clientId?: string
  jobId?: string
  brand?: string | null
}) {
  const who = approverName ? `${esc(approverName)} at ${esc(clientName)}` : esc(clientName)
  const subject = `Approved and ready to post — ${jobName}`
  const html = (id: BrandIdentity) => wrapFor(id, `
    ${buildGreeting(undefined, id)}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">${who} has just approved <span style="color:${C.ink};">${esc(fileName)}</span> for <span style="color:${C.ink};">${esc(jobName)}</span>. It's final, so it's ready for you to download and share.</p>
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">The link stays live for two months.</p>
    ${button(shareUrl, 'Download the video')}
    ${plainLink(shareUrl)}
  `)
  await send({ to, subject, html, type: 'marketing_approved_video', clientId, jobId, brand })
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

/** A client finished setting up their portal from the setup email. */
export async function sendAdminPortalSetUpEmail(clientName: string, contactPerson: string | null, clientId: string) {
  const who = contactPerson && contactPerson !== clientName ? `${contactPerson} at ${clientName}` : clientName
  const subject = `Portal set up — ${clientName}`
  const html = wrap(`
    ${heading('Kia ora Arlo,')}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;"><span style="color:${C.ink};font-weight:600;">${esc(who)}</span> got the setup email, chose a password and is signed in to their portal.</p>
    ${button(`${APP_URL}/dashboard/clients/${clientId}`, 'Open the client')}
  `)
  await send({ to: ADMIN_INBOX, subject, html, type: 'admin_portal_set_up', clientId })
}

export async function sendAdminDocumentSignedEmail(clientName: string, docName: string, signature: string, signedAt: string, clientId?: string) {
  const subject = `Document signed — ${docName}`
  const safeSignature = signature.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = wrap(`
    ${heading('Kia ora Arlo,')}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;"><span style="color:${C.ink};font-weight:600;">${esc(clientName)}</span> just signed <span style="color:${C.ink};">${esc(docName)}</span> on ${signedAt}.</p>
    <div style="background:${C.surface};border-radius:${C.radius};padding:24px 26px;margin:20px 0 0;" class="card-pad">
      <p style="color:${C.faint};font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;margin:0 0 10px;">Signature</p>
      <p style="color:${C.ink};font-size:24px;font-weight:600;letter-spacing:-0.01em;line-height:1.3;margin:0;font-family:'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;">${safeSignature}</p>
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
  brand,
}: {
  to: string
  clientName: string
  docName: string
  template: string
  clientId?: string
  portalToken?: string | null
  brand?: string | null
}) {
  // Tui Media's wording is unchanged. Arlo Radford's is the same message
  // without the dash, in the warmer voice of arloradford.nz.
  const subject = (id: BrandIdentity) => id.brand === 'tui_media' ? `${docName} — Tui Media` : `${docName} from Arlo Radford`
  const intro = (id: BrandIdentity) => id.brand === 'tui_media'
    ? `Your ${template.toLowerCase()} is ready to view and sign. Click the button below to open it in your client portal — you can review the details and add your signature online. Let me know if anything needs changing.`
    : `Your ${template.toLowerCase()} is ready to read and sign. It's in your portal at the button below, and you can sign it online in a minute. If anything needs changing, just let me know.`
  const portalUrl = portalToken ? `https://dashboard.tuimedia.nz/portal/client/${portalToken}` : null
  const buttonSection = portalUrl ? button(portalUrl, 'View and sign the document') : ''
  const html = (id: BrandIdentity) => wrapFor(id, `
    ${buildGreeting(clientName, id)}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">${intro(id)}</p>
    ${invoiceLine(id)}
    ${buttonSection}
  `)
  await send({
    to,
    subject,
    html,
    brand,
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
  daysSinceViewed: number | null,
  clientId?: string,
  jobId?: string,
  brand?: string | null,
) {
  const subject = `Just checking in — ${jobName}`
  // Two versions: they opened it and went quiet, or it has not been opened yet.
  const opener = daysSinceViewed === null
    ? `Just a nudge. Your video for <span style="color:${C.ink};">${esc(jobName)}</span> is in your portal, ready for you to watch.`
    : `Just a nudge. You had a look at your video for <span style="color:${C.ink};">${esc(jobName)}</span> ${daysSinceViewed <= 1 ? 'a day' : `${daysSinceViewed} days`} ago and haven't had a chance to come back to it yet.`
  const html = (id: BrandIdentity) => wrapFor(id, `
    ${buildGreeting(clientName, id)}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">${opener}</p>
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">No rush at all. Whenever you're ready, you can approve it or send through any feedback straight from the portal.</p>
    ${button(portalUrl, 'Open your portal')}
    <p style="color:${C.muted};font-size:13px;line-height:1.5;margin:16px 0 0;">If anything's unclear or you'd rather talk it through, email <a href="mailto:hello@tuimedia.nz" style="color:${C.ink};text-decoration:underline;">hello@tuimedia.nz</a>.</p>
  `)
  await send({ to, subject, html, type: 'delivery_reminder', clientId, jobId, brand })
}

// A retainer client with no shoot planned for the month (app/api/portal-reminders).
export async function sendShootPlanningReminderEmail(to: string, clientName: string, monthName: string, clientId?: string, brand?: string | null) {
  const subject = `Let's plan your ${monthName} shoot`
  const html = (id: BrandIdentity) => wrapFor(id, `
    ${buildGreeting(clientName, id)}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">We don't have a shoot booked in for <span style="color:${C.ink};">${esc(monthName)}</span> yet, and I'd like to get it locked in so your content for the month stays on track.</p>
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">Reply with a couple of days that suit you and I'll confirm one, or tell me if you'd rather skip this month.</p>
    ${button('mailto:hello@tuimedia.nz?subject=' + encodeURIComponent(`${monthName} shoot`), 'Pick a date')}
    <p style="color:${C.muted};font-size:13px;line-height:1.5;margin:16px 0 0;">Or email <a href="mailto:hello@tuimedia.nz" style="color:${C.ink};text-decoration:underline;">hello@tuimedia.nz</a> any time.</p>
  `)
  await send({ to, subject, html, type: 'shoot_reminder', clientId, brand })
}

// Two days after a proposal went out with no answer (app/api/portal-reminders).
export async function sendProposalFollowUpEmail(to: string, clientName: string, jobName: string, proposalUrl: string, opened: boolean, clientId?: string, jobId?: string, brand?: string | null) {
  const subject = `Following up on your proposal — ${jobName}`
  const opener = opened
    ? `Just following up on the proposal for <span style="color:${C.ink};">${esc(jobName)}</span>. I know it's one more thing on the list, so I wanted to check whether you had any questions about it.`
    : `Just making sure the proposal for <span style="color:${C.ink};">${esc(jobName)}</span> reached you. It's ready whenever you have a moment to look.`
  const html = (id: BrandIdentity) => wrapFor(id, `
    ${buildGreeting(clientName, id)}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">${opener}</p>
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">If it looks right you can accept it on the page. If the scope or price isn't quite right, just reply and I can rework it.</p>
    ${invoiceLine(id)}
    ${button(proposalUrl, 'View the proposal')}
    ${plainLink(proposalUrl)}
  `)
  await send({ to, subject, html, type: 'proposal_follow_up', clientId, jobId, brand })
}

// Two days after a contract was emailed and not signed (app/api/portal-reminders).
export async function sendContractFollowUpEmail(to: string, clientName: string, docName: string, portalUrl: string, opened: boolean, clientId?: string, brand?: string | null) {
  const subject = `Following up — ${docName}`
  const opener = opened
    ? `Just following up on <span style="color:${C.ink};">${esc(docName)}</span>. Once it's signed we can lock in the dates and get started.`
    : `Just making sure <span style="color:${C.ink};">${esc(docName)}</span> reached you. It's in your portal, ready to read and sign.`
  const html = (id: BrandIdentity) => wrapFor(id, `
    ${buildGreeting(clientName, id)}
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">${opener}</p>
    <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">You can sign it online in a minute, or download a copy as a PDF. If anything needs changing, leave a note on it or reply to this email.</p>
    ${invoiceLine(id)}
    ${button(portalUrl, 'Read and sign')}
  `)
  await send({ to, subject, html, type: 'contract_follow_up', clientId, brand })
}

export async function sendProposalAcceptedEmail(to: string, clientName: string, jobName: string, clientId?: string, jobId?: string) {
  const tpl = getTemplate('proposal_accepted')
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
  brand,
}: {
  to: string
  clientName: string
  setupUrl: string
  clientId?: string
  brand?: string | null
}) {
  await send({
    to,
    subject: (id) => `Set up your ${id.displayName} account`,
    type: 'account_setup',
    clientId,
    brand,
    rethrow: true,
    html: (id) => wrap(
      `
      ${buildGreeting(clientName, id)}
      <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">You now have your own login for the ${id.displayName} portal, the place where your footage, photos and paperwork live. Everything that used to arrive as a one-off link is in one spot, and it stays there.</p>
      <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">Choose a password to finish setting it up.</p>
      ${button(setupUrl, 'Choose a password')}
      <p style="color:${C.faint};font-size:13px;line-height:1.55;margin:16px 0 0;">This link works once. If it has run out by the time you get to it, press “Forgot your password?” at <a href="${APP_URL}${portalAuthHref('/portal/login', id.brand)}" style="color:${C.faint};text-decoration:underline;">${APP_URL.replace(/^https?:\/\//, '')}/portal/login</a> for a fresh one.</p>
      ${plainLink(setupUrl)}
    `,
      signoff(id),
      'Choose a password to finish setting up your portal.',
      id,
    ),
  })
}

/** Login for the marketing team member: approved videos to view and download. */
export async function sendMarketerAccountSetupEmail({
  to,
  name,
  setupUrl,
  reset,
  clientId,
  brand,
}: {
  to: string
  name: string
  setupUrl: string
  reset?: boolean
  clientId?: string
  brand?: string | null
}) {
  await send({
    to,
    subject: (id) => reset ? `Reset your ${id.displayName} password` : `Your ${id.displayName} login`,
    type: reset ? 'password_reset' : 'account_setup',
    clientId,
    brand,
    rethrow: true,
    html: (id) => wrap(
      `
      ${buildGreeting(name, id)}
      <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0 0 16px;">${reset ? `Choose a new password for your ${id.displayName} login.` : `You now have a${id.displayName.startsWith('A') ? 'n' : ''} ${id.displayName} login. It opens the library of approved videos, ready to watch and download for marketing.`}</p>
      <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">Choose a password to ${reset ? 'finish' : 'get started'}.</p>
      ${button(setupUrl, 'Choose a password')}
      <p style="color:${C.faint};font-size:13px;line-height:1.55;margin:16px 0 0;">This link works once. If it has run out, press “Forgot your password?” at <a href="${APP_URL}${portalAuthHref('/portal/login', id.brand)}" style="color:${C.faint};text-decoration:underline;">${APP_URL.replace(/^https?:\/\//, '')}/portal/login</a> for a fresh one.</p>
      ${plainLink(setupUrl)}
    `,
      signoff(id),
      'Choose a password to finish setting up your login.',
      id,
    ),
  })
}

/** The client asked for this from the portal's sign-in page. */
export async function sendClientPasswordResetEmail({
  to,
  clientName,
  setupUrl,
  clientId,
  brand,
}: {
  to: string
  clientName: string
  setupUrl: string
  clientId?: string
  brand?: string | null
}) {
  await send({
    to,
    subject: (id) => `Reset your ${id.displayName} password`,
    brand,
    type: 'password_reset',
    clientId,
    rethrow: true,
    html: (id) => wrap(
      `
      ${buildGreeting(clientName, id)}
      <p style="color:${C.muted};font-size:15px;line-height:1.7;margin:0;">Someone asked to reset the password for your ${id.displayName} portal. If that was you, choose a new one below.</p>
      ${button(setupUrl, 'Choose a new password')}
      <p style="color:${C.faint};font-size:13px;line-height:1.55;margin:16px 0 0;">This link works once. If you didn't ask for it, ignore this email and your password stays as it is.</p>
      ${plainLink(setupUrl)}
    `,
      signoff(id),
      'Choose a new password for your portal.',
      id,
    ),
  })
}
