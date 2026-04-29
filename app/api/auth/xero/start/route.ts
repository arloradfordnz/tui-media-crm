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
  // Short-lived cookie for CSRF — verified in callback
  res.cookies.set('xero_oauth_state', state, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
