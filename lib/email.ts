import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = process.env.EMAIL_FROM || 'Tui Media <noreply@tuimedia.nz>'

async function send({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!resend) {
    console.log(`[email skipped] No RESEND_API_KEY — would have sent to ${to}: ${subject}`)
    return
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html })
  } catch (err) {
    console.error('[email error]', err)
  }
}

function wrap(body: string) {
  return `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 20px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:32px;">
          <img src="https://dashboard.tuimedia.nz/Primary_White.svg" alt="Tui Media" width="140" style="display:inline-block;" />
        </div>
        <div style="background:#141414;border:1px solid #1e1e1e;border-radius:12px;padding:32px;">
          ${body}
        </div>
        <p style="text-align:center;color:#666;font-size:12px;margin-top:24px;">&copy; ${new Date().getFullYear()} Tui Media &middot; New Zealand</p>
      </div>
    </div>
  `
}

export async function sendPortalDeliveryEmail(to: string, clientName: string, jobName: string, portalUrl: string) {
  await send({
    to,
    subject: `Your video is ready for review — ${jobName}`,
    html: wrap(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#f5f5f5;">Hi ${clientName},</h2>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 24px;">Your video for <strong style="color:#f5f5f5;">${jobName}</strong> is ready for review. Click the button below to watch it and let us know what you think.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:#7790ed;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Your Video</a>
      </div>
      <p style="color:#666;font-size:13px;margin:0;">If the button doesn't work, copy this link: <a href="${portalUrl}" style="color:#7790ed;">${portalUrl}</a></p>
    `),
  })
}

export async function sendApprovalConfirmationEmail(to: string, clientName: string, jobName: string) {
  await send({
    to,
    subject: `Delivery approved — ${jobName}`,
    html: wrap(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#f5f5f5;">Hi ${clientName},</h2>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 16px;">Thank you for approving the delivery for <strong style="color:#f5f5f5;">${jobName}</strong>. We're glad you're happy with the result!</p>
      <p style="color:#a3a3a3;line-height:1.6;margin:0;">We'll prepare your final files and have them ready shortly.</p>
    `),
  })
}

export async function sendRevisionRequestEmail(to: string, clientName: string, jobName: string, round: number) {
  await send({
    to,
    subject: `Revision request received — ${jobName}`,
    html: wrap(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#f5f5f5;">Hi ${clientName},</h2>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 16px;">We've received your revision request (round ${round}) for <strong style="color:#f5f5f5;">${jobName}</strong>.</p>
      <p style="color:#a3a3a3;line-height:1.6;margin:0;">We'll get to work on the changes and send you an updated version soon.</p>
    `),
  })
}

export async function sendProposalEmail(to: string, clientName: string, jobName: string, proposalUrl: string) {
  await send({
    to,
    subject: `Proposal for ${jobName} — Tui Media`,
    html: wrap(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#f5f5f5;">Hi ${clientName},</h2>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 24px;">We've prepared a proposal for <strong style="color:#f5f5f5;">${jobName}</strong>. Click below to view the details and let us know if you'd like to proceed.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${proposalUrl}" style="display:inline-block;background:#7790ed;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Proposal</a>
      </div>
      <p style="color:#666;font-size:13px;margin:0;">If the button doesn't work, copy this link: <a href="${proposalUrl}" style="color:#7790ed;">${proposalUrl}</a></p>
    `),
  })
}

export async function sendWelcomeEmail(to: string, clientName: string) {
  await send({
    to,
    subject: 'Welcome to Tui Media — looking forward to working together',
    html: wrap(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#f5f5f5;">Hi ${clientName},</h2>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 16px;">Welcome to Tui Media! We're thrilled to have you on board and excited about the opportunity to bring your vision to life through professional videography.</p>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 16px;">Arlo will be in touch shortly to discuss your project and next steps. In the meantime, feel free to reach out if you have any questions.</p>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 8px;">Looking forward to creating something great together.</p>
      <p style="color:#f5f5f5;margin:24px 0 0;font-weight:600;">Arlo | Tui Media | tuimedia.nz</p>
    `),
  })
}

export async function sendProposalAcceptedEmail(to: string, clientName: string, jobName: string) {
  await send({
    to,
    subject: `Proposal accepted — ${jobName}`,
    html: wrap(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#f5f5f5;">Great news!</h2>
      <p style="color:#a3a3a3;line-height:1.6;margin:0 0 16px;"><strong style="color:#f5f5f5;">${clientName}</strong> has accepted the proposal for <strong style="color:#f5f5f5;">${jobName}</strong>.</p>
      <p style="color:#a3a3a3;line-height:1.6;margin:0;">The job has been moved to Booked status. Time to get started!</p>
    `),
  })
}
