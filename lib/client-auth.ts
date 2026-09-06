import { createServerSupabaseClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * Auth for client portal accounts.
 *
 * Two rules hold everything else up:
 *
 *  1. Role comes from a *verified* user. getUser() asks the auth server, so
 *     app_metadata in its response is what Supabase holds, not what the
 *     browser's cookie claims. Never make this decision from getSession().
 *
 *  2. Which client's data you may read comes from the client_users table, not
 *     from the token. Even a user whose metadata said the wrong thing can only
 *     reach the client they have a row for.
 *
 * app_metadata is writable only by the service role, so a client cannot edit
 * their way out of the 'client' role and into the dashboard.
 */

export type ClientSession = { userId: string; clientId: string; email: string }

/** The signed-in client, or null. Verified against the auth server. */
export async function getClientSession(): Promise<ClientSession | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  if (!admin) return null

  const { data } = await admin
    .from('client_users')
    .select('client_id')
    .eq('user_id', user.id)
    .single()

  if (!data) return null
  return { userId: user.id, clientId: data.client_id as string, email: user.email ?? '' }
}

/**
 * True when the verified user is a client account.
 *
 * Used by the dashboard to keep clients out. It reads the role claim rather
 * than hitting client_users because it runs on every dashboard navigation and
 * the claim is already verified — but it is deliberately the *inverse* test to
 * the one above: the dashboard denies on a positive 'client' match, the portal
 * grants on a positive client_users match. Nothing is admitted anywhere on the
 * absence of evidence.
 */
export async function isClientAccount(): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.app_metadata?.role === 'client'
}
