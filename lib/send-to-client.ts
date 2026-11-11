import type { SupabaseClient } from '@supabase/supabase-js'
import { emailPortalPasswordLink } from '@/lib/portal-setup-link'
import { sendProposalEmail, sendDocumentToClientEmail } from '@/lib/email'

// The three ways Tui Media reaches a client by email from inside the CRM:
// their portal login, a proposal, and a document to read or sign. Each lives
// here, taking a service-role client, so the dashboard buttons (which check
// Arlo's session first) and the Tui assistant (Telegram has no session at all)
// run the same code and cannot drift apart.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'

export type SendResult = { ok: true; email: string; note?: string } | { ok: false; error: string }

/**
 * Create (or re-send) a client's portal account and email them a link to set a
 * password, or with kind 'reset' email a password reset for an account that
 * already exists.
 *
 * The account is made here rather than by the client signing themselves up.
 * There is no public sign-up: an account only exists because Arlo (or Tui, on
 * his say) made one for a client he already has, so there is no route by which
 * a stranger can get an authenticated session at all. The email always goes to
 * the address on the client record, never one passed in.
 */
export async function sendPortalLogin(
  admin: SupabaseClient,
  clientId: string,
  kind: 'setup' | 'reset' = 'setup',
): Promise<SendResult> {
  const { data: client } = await admin
    .from('clients')
    .select('id, name, email, contact_person')
    .eq('id', clientId)
    .single()

  if (!client) return { ok: false, error: 'Client not found.' }
  const email = (client.email as string | null)?.trim()
  if (!email) return { ok: false, error: `${client.name} has no email address on file.` }

  // Existing row means we are re-sending, not creating a second account.
  const { data: existing } = await admin
    .from('client_users')
    .select('user_id')
    .eq('client_id', clientId)
    .limit(1)
    .maybeSingle()

  let userId = existing?.user_id as string | undefined

  if (kind === 'reset' && !userId) {
    return { ok: false, error: `${client.name} has no portal login yet. Send them the setup email instead.` }
  }

  if (userId) {
    // The client's email may have been corrected since the account was made.
    // The link is generated for the address on the client record, so the
    // login has to follow it or generateLink() finds no such user.
    const { data: current } = await admin.auth.admin.getUserById(userId)
    if (current?.user && current.user.email?.toLowerCase() !== email.toLowerCase()) {
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
      if (error) return { ok: false, error: error.message }
    }
  }

  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      // Confirmed on creation because Arlo already knows this address: he has
      // been mailing deliverables to it. The password link that follows is
      // itself proof of control, so nothing is skipped by not double-checking.
      email_confirm: true,
      app_metadata: { role: 'client', client_id: clientId },
    })

    if (error || !created?.user) {
      return { ok: false, error: error?.message ?? 'Could not create the account.' }
    }
    userId = created.user.id

    const { error: linkError } = await admin
      .from('client_users')
      .insert({ user_id: userId, client_id: clientId })

    if (linkError) {
      // Without the link row the account can authenticate but resolves to no
      // client, which would strand them on an empty portal with no way back.
      // Roll it back so a retry starts clean.
      await admin.auth.admin.deleteUser(userId)
      return { ok: false, error: linkError.message }
    }
  }

  const sent = await emailPortalPasswordLink(admin, {
    email,
    name: (client.contact_person as string | null) || (client.name as string),
    clientId,
    kind,
  })
  if (!sent.ok) return sent

  if (kind === 'setup') {
    await admin
      .from('clients')
      .update({ portal_invited_at: new Date().toISOString() })
      .eq('id', clientId)
  }

  return { ok: true, email }
}

/**
 * Send a draft proposal: flips it to 'sent' and emails the client its link.
 * The proposal is live the moment its status flips, so a mail failure is
 * reported back in `emailError` rather than read as a failed send.
 */
export async function sendProposalToClient(
  supabase: SupabaseClient,
  proposalId: string,
): Promise<{ error?: string; emailed?: boolean; emailError?: string; jobId?: string; jobName?: string; clientName?: string }> {
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, job_id, token, status, jobs(id, name, client_id, clients(name, email))')
    .eq('id', proposalId)
    .single()

  if (!proposal) return { error: 'Proposal not found.' }
  if (proposal.status !== 'draft') return { error: 'This proposal has already been sent.' }

  const { error: sendError } = await supabase.from('proposals').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', proposalId)
  if (sendError) return { error: `Couldn't send: ${sendError.message}` }

  const job = proposal.jobs as unknown as { id: string; name: string; client_id: string; clients: { name: string; email: string | null } }

  await supabase.from('activities').insert({ action: 'proposal_sent', details: `Proposal sent for "${job.name}"`, job_id: proposal.job_id, client_id: job.client_id })
  await supabase.from('notifications').insert({ title: 'Proposal Sent', message: `Proposal for "${job.name}" has been sent`, type: 'status_change', job_id: proposal.job_id, client_id: job.client_id })

  let emailed = false
  let emailError: string | undefined
  if (job.clients.email) {
    try {
      await sendProposalEmail(job.clients.email, job.clients.name, job.name, `${APP_URL}/proposal/${proposal.token}`)
      emailed = true
    } catch (err) {
      emailError = err instanceof Error ? err.message : 'The email could not be sent.'
      console.error('[proposals] email failed:', err)
    }
  }

  return { emailed, emailError, jobId: proposal.job_id, jobName: job.name, clientName: job.clients.name }
}

/**
 * Email a document (a contract to sign, a brief) to its client with a link to
 * their portal, and mark it sent so it shows there. The first send time is
 * kept, so re-sending does not push the two-day follow-up back.
 */
export async function sendDocumentToClient(admin: SupabaseClient, docId: string): Promise<SendResult> {
  const { data: doc } = await admin.from('documents').select('id, name, doc_type, content, client_id').eq('id', docId).single()
  if (!doc) return { ok: false, error: 'Document not found.' }
  if (!doc.client_id) return { ok: false, error: 'This document is not attached to a client.' }

  const { data: client } = await admin
    .from('clients')
    .select('id, name, email, contact_person, portal_token')
    .eq('id', doc.client_id)
    .single()
  if (!client) return { ok: false, error: 'Client not found.' }
  const email = (client.email as string | null)?.trim()
  if (!email) return { ok: false, error: `${client.name} has no email address on file.` }

  let portalToken = client.portal_token as string | null
  if (!portalToken) {
    portalToken = crypto.randomUUID()
    await admin.from('clients').update({ portal_token: portalToken }).eq('id', client.id)
  }

  let template = 'Document'
  try {
    const parsed = JSON.parse(doc.content ?? '')
    if (parsed && typeof parsed.template === 'string' && parsed.template) template = parsed.template
  } catch { /* free text: a plain document */ }
  if (template === 'Document' && doc.doc_type === 'contract') template = 'Contract'

  try {
    await sendDocumentToClientEmail({
      to: email,
      clientName: (client.contact_person as string | null) || (client.name as string),
      docName: doc.name as string,
      template,
      clientId: client.id as string,
      portalToken,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'The email could not be sent.' }
  }
  await admin.from('documents').update({ sent_at: new Date().toISOString() }).eq('id', docId).is('sent_at', null)
  return { ok: true, email }
}
