import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison for secrets.
 *
 * `a === b` returns as soon as a character differs, so how long it takes leaks
 * how much of a guess was right. timingSafeEqual does not — but it throws on a
 * length mismatch, so the lengths are compared first (the length of a secret is
 * not what is being protected). An unset secret never matches anything.
 */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** True when the request carries `Authorization: Bearer <CRON_SECRET>`. */
export function hasCronBearer(req: { headers: Headers }): boolean {
  const auth = req.headers.get('authorization') ?? ''
  return auth.startsWith('Bearer ') && secretMatches(auth.slice(7), process.env.CRON_SECRET)
}
