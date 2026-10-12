'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, getAuthUser } from '@/lib/supabase-admin'
import { emailPortalPasswordLink } from '@/lib/portal-setup-link'

export type InviteResult = { ok: true; email: string } | { ok: false; error: string }

/**
 * Create (or re-send) a portal account for a client and email them a link to
 * set their password.
 *
 * The account is created here rather than by the client signing themselves up.
 * There is no public sign-up: an account only exists because Arlo made one for
 * a client he already has, which means there is no route by which a stranger
 * can get an authenticated session at all.
 */
export async function inviteClientToPortal(clientId: string): Promise<InviteResult> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: 'Supabase is not configured.' }

  // getAuthUser() returns null for client accounts as well as for signed-out
  // callers, so this is also what stops a client inviting anyone.
  const user = await getAuthUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

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
      // Confirmed on creation because Arlo already knows this address — he has
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
    kind: 'setup',
  })
  if (!sent.ok) return sent

  await admin
    .from('clients')
    .update({ portal_invited_at: new Date().toISOString() })
    .eq('id', clientId)

  revalidatePath(`/dashboard/clients/${clientId}`)
  return { ok: true, email }
}
