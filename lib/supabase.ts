import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

// Server-only: this module imports next/headers. The browser client lives in
// lib/supabase-browser.ts.

// cache() is React's per-REQUEST memo, not a cross-request cache: two browsers
// hitting the server at the same instant get their own entry, and nothing
// survives the response. That is what makes it safe to memoise something as
// session-specific as a Supabase client — and the reason it is worth doing is
// that this function is called from 49 places, several of which run inside a
// single render.
export const createServerSupabaseClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — session refresh is handled by middleware
          }
        },
      },
    }
  )
})

/**
 * The verified user for this request, fetched at most ONCE.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * getUser() is not a cookie read. It is an HTTPS round trip to the Supabase
 * auth server, and that is the whole point of it — it is what makes the role
 * claim trustworthy rather than whatever the browser's cookie says. lib/
 * client-auth.ts explains why the app insists on that level of trust.
 *
 * The cost is that every caller who wants to know "who is this, really?" was
 * paying for its own round trip. The dashboard layout wanted to know twice —
 * once to keep clients out (isClientAccount) and once to confirm the admin
 * claim is in the token (hasAdminClaim) — and because those were two separate
 * awaits on two separate clients, it paid for two round trips SEQUENTIALLY
 * before it rendered a single byte. Server Actions and API routes on the same
 * request added more on top.
 *
 * Wrapping it in cache() collapses all of that to one call per request. Every
 * caller still asks the auth server; they just all get the same answer to the
 * same question instead of asking it again. No check is weakened: the identity
 * returned here is exactly the identity getUser() returned, verified the same
 * way.
 *
 * Returns null when nobody is signed in, which is a legitimate answer and is
 * cached like any other.
 */
export const getVerifiedUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

/** The verified role claim for this request: 'admin', 'client', or null. */
export async function getVerifiedRole(): Promise<string | null> {
  const user = await getVerifiedUser()
  return (user?.app_metadata?.role as string | undefined) ?? null
}
