import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase'
import { buildAuthUrl } from '@/lib/xero'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const state = randomBytes(24).toString('hex')
  const url = buildAuthUrl(state)

  const res = NextResponse.redirect(url)
  // Short-lived cookie for CSRF — verified in callback. SameSite=None +
  // Secure is required for the cookie to be returned on the cross-site GET
  // navigation back from login.xero.com to our /callback route. On Vercel
  // production we're always behind HTTPS so Secure is fine; the local dev
  // path uses Lax+non-secure as a fallback.
  const isHttps = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https'
  res.cookies.set('xero_oauth_state', state, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
