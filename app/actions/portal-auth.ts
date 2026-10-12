'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getVerifiedUser } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { emailPortalPasswordLink } from '@/lib/portal-setup-link'
import { checkPassword } from '@/lib/password-strength'
import { breachCount } from '@/lib/pwned'

export type SetPasswordState =
  | {
      error?: string
      /** The emailed token has been spent; further tries run on the session it made. */
      verified?: boolean
      /** The link itself is dead, so the fix is a fresh one, not another try. */
      expired?: boolean
    }
  | undefined

/**
 * Set a portal password, from the emailed setup/reset link or from a signed-in
 * client changing theirs.
 *
 * With a token, this is the moment the link is spent: verifyOtp() turns the
 * hashed token into a session (written to cookies — a Server Action can), and
 * the password is set on that session. See lib/portal-setup-link.ts for why
 * this waits for the submit instead of happening when the link is opened.
 */
export async function setPortalPassword(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  // Checked before the token is touched, so a typo or a weak choice does not
  // spend the link. The browser shows the same meter, but this is the check
  // that counts.
  if (password !== confirm) return { error: 'Those two passwords don’t match.' }
  const strength = checkPassword(password)
  if (!strength.ok) return { error: strength.problem ?? 'Choose a stronger password.' }
  if (await breachCount(password)) {
    return { error: 'That password has appeared in a data breach, so anyone can guess it. Choose a different one.' }
  }

  const supabase = await createServerSupabaseClient()

  if (token) {
    const { data, error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: token })
    if (error || !data.user) {
      return { error: 'That link has expired or has already been used.', expired: true }
    }
    // These links are only ever minted for client accounts. Anything else is
    // not ours to finish here.
    if (data.user.app_metadata?.role !== 'client') {
      await supabase.auth.signOut()
      return { error: 'That link isn’t for a portal account.', expired: true }
    }
    // The email address is only known now. The link is spent, so a retry has
    // to run on the session it created.
    if (!checkPassword(password, [data.user.email]).ok) {
      return { error: 'Don’t use your name or email address in your password.', verified: true }
    }
  } else {
    const user = await getVerifiedUser()
    if (!user || user.app_metadata?.role !== 'client') {
      return { error: 'Your session has ended. Sign in again, or ask for a fresh link.', expired: true }
    }
    if (!checkPassword(password, [user.email]).ok) {
      return { error: 'Don’t use your name or email address in your password.' }
    }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    // The session exists now even though the password did not take, so the
    // next try must not resend the spent token.
    return { error: error.message, verified: true }
  }

  redirect('/portal/me')
}

export type ResetRequestState = { sent?: boolean; error?: string } | undefined

/**
 * "Forgot your password?" on the portal sign-in page.
 *
 * Always answers the same way whether or not the address has an account, so
 * the form cannot be used to find out who Tui Media's clients are. Only client
 * accounts are ever sent a link; Arlo's own login resets through Supabase.
 */
export async function requestPortalPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { error: 'Enter the email address you sign in with.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Sign-in is unavailable right now. Email hello@tuimedia.nz.' }

  // One link a minute per address. Anyone can type anyone's email in here,
  // and this stops the form being used to flood a client's inbox.
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await admin
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .eq('to_address', email)
    .in('type', ['account_setup', 'password_reset'])
    .gte('created_at', since)
  if (count) return { sent: true }

  // A page of 1000 covers every login this business will have; the admin API
  // has no lookup by email.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = list?.users.find(
    (u) => u.email?.toLowerCase() === email && u.app_metadata?.role === 'client',
  )
  if (!user) return { sent: true }

  // client_users, not the token's claim, decides which client this is.
  const { data: link } = await admin
    .from('client_users')
    .select('client_id, clients(name, contact_person)')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!link) return { sent: true }
  const client = link.clients as unknown as { name: string; contact_person: string | null } | null

  const sent = await emailPortalPasswordLink(admin, {
    email,
    name: client?.contact_person || client?.name || '',
    clientId: link.client_id as string,
    kind: 'reset',
  })
  if (!sent.ok) console.error('[portal reset]', sent.error)

  return { sent: true }
}
