/**
 * fetch for the server-side Supabase clients, with a deadline.
 *
 * supabase-js puts no timeout on its requests. On 15 November 2026 Supabase's
 * REST layer (PostgREST) stopped answering table queries while Postgres, auth
 * and storage were all fine, and every page hung until Vercel killed the
 * function at 60 seconds. The dashboard just sat on its loading screen.
 *
 * With a deadline, a stuck request comes back as an ordinary Supabase error
 * (supabase-js turns a rejected fetch into `{ data: null, error }`), so the
 * page renders its "couldn't load" state or error.tsx instead of spinning.
 *
 * 10 seconds is far past anything real here: a query costs ~130ms from sin1
 * (see AGENTS.md), and nothing streams large bodies through supabase-js.
 */
export const SUPABASE_TIMEOUT_MS = 10_000

export const timedFetch: typeof fetch = (input, init) => {
  const deadline = AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline
  return fetch(input, { ...init, signal })
}
