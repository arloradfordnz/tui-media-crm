import { getVerifiedUser } from '@/lib/supabase'

/**
 * The marketing team member: a login that can watch and download approved
 * videos and do nothing else.
 *
 * Same trust model as lib/client-auth.ts — the role is read from a *verified*
 * user (getUser() asks the auth server), and app_metadata is writable only by
 * the service role, so it cannot be edited from the browser. The role is not
 * 'admin', so is_admin() denies it in every RLS policy and getAuthUser()
 * rejects it on every API route; the only data it ever reaches is what
 * app/marketing/page.tsx chooses to read with the service role.
 *
 * Arlo (admin) passes too, so he can see exactly what the marketer sees.
 */
export async function getMarketingViewer() {
  const user = await getVerifiedUser()
  const role = user?.app_metadata?.role
  if (!user || (role !== 'marketer' && role !== 'admin')) return null
  return { userId: user.id, email: user.email ?? '', role: role as 'marketer' | 'admin' }
}
