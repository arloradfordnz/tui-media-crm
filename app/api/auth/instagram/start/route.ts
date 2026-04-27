import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Kicks off the Meta Graph API OAuth flow for connecting an Instagram
 * Business / Creator account. The IG account must be linked to a Facebook
 * Page; Meta returns the Page in /me/accounts and we walk to the
 * instagram_business_account from there in the callback.
 *
 * Required env vars:
 *   - META_APP_ID
 *   - META_APP_SECRET
 *   - META_OAUTH_REDIRECT_URI  (e.g. https://dashboard.tuimedia.nz/api/auth/instagram/callback)
 */
export async function GET() {
  const appId = process.env.META_APP_ID
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI
  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: 'Set META_APP_ID and META_OAUTH_REDIRECT_URI in your environment to enable Instagram.' },
      { status: 500 },
    )
  }

  const state = crypto.randomBytes(16).toString('hex')
  const scopes = [
    'instagram_basic',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ].join(',')

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes)

  const res = NextResponse.redirect(url.toString())
  // Stash the state in a short-lived cookie so the callback can verify it.
  res.cookies.set('meta_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return res
}
