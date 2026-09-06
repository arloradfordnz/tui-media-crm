import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for the browser.
 *
 * Kept apart from lib/supabase.ts, which imports next/headers and so cannot be
 * pulled into a client bundle — importing the server module from a 'use client'
 * file fails the build outright.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
