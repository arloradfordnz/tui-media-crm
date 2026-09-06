import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Service-role Supabase client — bypasses RLS entirely.
 *
 * Use ONLY in server code that has already authorised the request itself:
 *  - portal/proposal pages and actions, after matching the token in the URL
 *  - cron routes, after checking the bearer secret
 *  - dashboard actions that need to touch tables the authenticated role
 *    has no policy for (e.g. email_logs cleanup)
 *
 * Never let unverified request input decide *which rows* this client
 * touches without scoping the query to the verified token/client first.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Returns the logged-in *admin* user for the current request, or null.
 * API routes must call this and 401 when it returns null — the middleware
 * only guards /dashboard page navigations, not /api.
 *
 * Client portal accounts live in the same Supabase Auth project as Arlo's
 * admin login, so "is someone signed in" stopped being a sufficient test the
 * moment clients could hold accounts. This returns null for them: a client
 * calling a CRM API route is an unauthenticated caller as far as every route
 * that uses this is concerned. app_metadata.role is set only by the service
 * role, and getUser() verifies with the auth server rather than trusting the
 * request's cookie, so the claim cannot be forged from the browser.
 */
export async function getAuthUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (user.app_metadata?.role === 'client') return null
  return user
}

/** Standard 401 response for API routes. */
export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
