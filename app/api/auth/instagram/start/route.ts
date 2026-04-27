import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Kicks off the Instagram Login OAuth flow (the 2026 path that replaces
 * the Facebook-Page-routed flow for new apps). The Instagram product
 * card in the Meta App Dashboard generates a separate Instagram App ID
 * and Secret — those go here, NOT the parent Meta App ID/Secret.
 *
 * Required env vars:
 *   - INSTAGRAM_APP_ID
 *   - INSTAGRAM_APP_SECRET
 *   - INSTAGRAM_OAUTH_REDIRECT_URI (e.g. https://dashboard.tuimedia.nz/api/auth/instagram/callback)
 */
export async function GET() {
  const appId = process.env.INSTAGRAM_APP_ID
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI
  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: 'Set INSTAGRAM_APP_ID and INSTAGRAM_OAUTH_REDIRECT_URI in your environment to enable Instagram.' },
      { status: 500 },
    )
  }

  const state = crypto.randomBytes(16).toString('hex')
  // 2026 Instagram Login scope names. instagram_business_basic is required;
  // instagram_business_manage_insights unlocks per-post view/reach/engagement.
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_insights',
  ].join(',')

  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes)
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set('ig_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return res
}
