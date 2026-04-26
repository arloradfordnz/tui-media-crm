import { headers } from 'next/headers'

/**
 * Returns true when the current request appears to come from one of the IP
 * addresses listed in ADMIN_IPS (comma-separated env var). Used to suppress
 * automatic admin notification emails when the studio owner is just checking
 * the portal themselves.
 */
export async function isAdminViewing(): Promise<boolean> {
  const adminIps = (process.env.ADMIN_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (adminIps.length === 0) return false

  const h = await headers()
  const fwd = h.get('x-forwarded-for') || ''
  const real = h.get('x-real-ip') || ''
  const candidates = [
    ...fwd.split(',').map((s) => s.trim()),
    real,
  ].filter(Boolean)

  return candidates.some((ip) => adminIps.includes(ip))
}
