import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Lands the client after they click the setup link in their email, exchanging
 * the one-time code for a session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  // Only ever a path on this origin. `next` arrives in a URL the client can
  // edit, so an absolute URL here would be an open redirect out of a page they
  // reached from an email we sent.
  const raw = searchParams.get('next') ?? '/portal/setup'
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/portal/setup'

  if (!code) {
    return NextResponse.redirect(new URL('/portal/login?error=link', origin))
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Almost always an expired or already-used link rather than anything
    // sinister, so the login page says so and offers a way to get a new one.
    return NextResponse.redirect(new URL('/portal/login?error=expired', origin))
  }

  return NextResponse.redirect(new URL(next, origin))
}
