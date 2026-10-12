import { createHash } from 'node:crypto'

/**
 * Has this password appeared in a known data breach?
 *
 * Uses Have I Been Pwned's range API, which is built so the password never
 * leaves the server: only the first five characters of its SHA-1 are sent, the
 * API returns every breached hash that starts with them, and the match is made
 * here. `Add-Padding` hides the true size of the response.
 *
 * Fails OPEN. If the lookup is slow or down, a person setting a password must
 * not be locked out of their own account by a third party's outage — the local
 * strength check in lib/password-strength.ts still applies.
 */
export async function breachCount(password: string): Promise<number> {
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'tui-media-crm' },
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    })
    if (!res.ok) return 0

    for (const line of (await res.text()).split('\n')) {
      const [hash, count] = line.trim().split(':')
      if (hash === suffix) return parseInt(count, 10) || 0
    }
    return 0
  } catch {
    return 0
  }
}
