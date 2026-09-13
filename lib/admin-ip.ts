import { headers } from 'next/headers'
import { getVerifiedUser } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * "Is the person looking at this portal page actually Arlo?"
 *
 * The portal is public — the token in the URL is the auth — so opening a
 * client's portal to check how it looks used to fire the same "your client
 * viewed the delivery" email a real client triggers. Three signals answer it,
 * cheapest first:
 *
 *   1. A signed-in admin session. The dashboard and the portal share an
 *      origin, so if Arlo is logged into the CRM in that browser his Supabase
 *      cookies come along to the portal. This is the signal that actually
 *      works day to day — it follows him to any network, phone or laptop.
 *   2. The request IP, against an allow-list. Covers a private window or a
 *      browser that isn't signed in.
 *   3. A `tui_self_view` cookie, set for a year whenever 1 or 2 matched, so a
 *      later visit from a mobile network with a different IP still counts.
 *
 * The allow-list is read from the `admin_ips` app setting (editable in
 * Settings → Portal notifications) and from the ADMIN_IPS env var, so it can
 * be changed without a deploy.
 */

const SELF_VIEW_COOKIE = 'tui_self_view'

/** The client IP as the proxy reported it, or null behind no proxy. */
export async function getRequestIp(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for') || ''
  // Left-most entry is the original client; everything after is proxy chain.
  const first = fwd.split(',')[0]?.trim()
  return first || h.get('x-real-ip')?.trim() || null
}

/** Allow-listed IPs, from the DB setting first and the env var as a fallback. */
export async function getAdminIps(): Promise<string[]> {
  const fromEnv = (process.env.ADMIN_IPS || '').split(',')
  let fromDb: string[] = []
  const admin = createAdminClient()
  if (admin) {
    const { data } = await admin.from('app_settings').select('value').eq('key', 'admin_ips').maybeSingle()
    fromDb = (data?.value || '').split(',')
  }
  return [...new Set([...fromDb, ...fromEnv].map((s) => s.trim()).filter(Boolean))]
}

async function hasAdminSession(): Promise<boolean> {
  try {
    const user = await getVerifiedUser()
    if (!user) return false
    const role = (user.app_metadata as { role?: string } | null)?.role
    // Anyone signed in as a *client* is a real client, not Arlo checking.
    return role === 'admin'
  } catch {
    return false
  }
}

export async function isAdminViewing(): Promise<boolean> {
  const h = await headers()
  if (h.get('cookie')?.includes(`${SELF_VIEW_COOKIE}=1`)) return true

  if (await hasAdminSession()) return true

  const allow = await getAdminIps()
  if (allow.length === 0) return false
  const ip = await getRequestIp()
  return !!ip && allow.includes(ip)
}

export { SELF_VIEW_COOKIE }
