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

/**
 * Whether the current session's token carries an admin claim.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * `public.is_admin()` reads `app_metadata.role` out of the **JWT**, not out of
 * auth.users. A JWT is a snapshot taken when the token was minted, so an
 * account whose role is added *after* it signed in keeps presenting a token
 * with no role until that token is refreshed.
 *
 * On 6 September 2026 that combination locked the owner out of his own CRM.
 * `role: 'admin'` was stamped on his account the day after his browser had
 * last signed in, and `is_admin()` was then flipped from a deny-list to an
 * allow-list. His stored session was still presenting the older, roleless
 * token, so every policy denied it: every list rendered empty and every insert
 * came back "new row violates row-level security policy". A CRM showing zero
 * clients is indistinguishable from one that has lost them, which is the worst
 * failure mode this app has.
 *
 * ── This function does NOT repair it ───────────────────────────────────────
 * The repair is a token refresh, and a refresh MUST happen in proxy.ts. Token
 * rotation issues a new refresh token and invalidates the old one, so whoever
 * calls refreshSession() has to be able to write the result back to cookies.
 * A Server Component cannot: `setAll` in lib/supabase.ts is wrapped in a
 * try/catch that silently discards the write. Calling it from the dashboard
 * layout therefore burns the browser's refresh token and hands back nothing,
 * signing the user out on their very next request — which is exactly what the
 * first version of this fix did.
 *
 * So: proxy.ts repairs, this reports, and the layout redirects on a genuine
 * failure.
 */
export async function hasAdminClaim(): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.app_metadata?.role === 'admin'
}
