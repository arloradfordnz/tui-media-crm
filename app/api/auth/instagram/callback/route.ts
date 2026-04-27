import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Instagram Login OAuth callback. Three-step exchange per the 2026 docs:
 *   1. Trade the code for a short-lived token at api.instagram.com.
 *   2. Upgrade to a long-lived token (~60 days) at graph.instagram.com.
 *   3. Look up the IG account profile and persist everything in
 *      `connected_accounts`.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  const back = (msg: string) =>
    NextResponse.redirect(new URL(`/dashboard/analytics?ig_error=${encodeURIComponent(msg)}`, req.url))

  if (error) return back(errorDescription || error)
  if (!code) return back('Missing OAuth code from Instagram.')

  const cookieState = req.cookies.get('ig_oauth_state')?.value
  if (!cookieState || cookieState !== state) return back('OAuth state mismatch — please try again.')

  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI
  if (!appId || !appSecret || !redirectUri) return back('Instagram env vars not configured.')

  try {
    // 1. Exchange code → short-lived user token (form-encoded POST, not JSON).
    const shortBody = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    })
    const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: shortBody,
      cache: 'no-store',
    })
    if (!shortRes.ok) {
      const txt = await shortRes.text()
      return back(`Token exchange failed (${shortRes.status}): ${txt.slice(0, 120)}`)
    }
    const shortData = await shortRes.json() as { access_token: string; user_id?: number }

    // 2. Upgrade to long-lived token (~60 days).
    const longUrl = new URL('https://graph.instagram.com/access_token')
    longUrl.searchParams.set('grant_type', 'ig_exchange_token')
    longUrl.searchParams.set('client_secret', appSecret)
    longUrl.searchParams.set('access_token', shortData.access_token)
    const longRes = await fetch(longUrl, { cache: 'no-store' })
    if (!longRes.ok) return back(`Long-lived token exchange failed: ${longRes.status}`)
    const longData = await longRes.json() as { access_token: string; expires_in?: number }
    const longToken = longData.access_token
    const expiresAt = longData.expires_in ? new Date(Date.now() + longData.expires_in * 1000).toISOString() : null

    // 3. Fetch the IG account profile so we have a name + id to display.
    const meUrl = new URL('https://graph.instagram.com/v22.0/me')
    meUrl.searchParams.set('fields', 'user_id,username,name,account_type,profile_picture_url')
    meUrl.searchParams.set('access_token', longToken)
    const meRes = await fetch(meUrl, { cache: 'no-store' })
    if (!meRes.ok) return back(`Couldn't read profile: ${meRes.status}`)
    const me = await meRes.json() as { user_id?: string; username?: string; name?: string; account_type?: string; profile_picture_url?: string }
    const igUserId = String(me.user_id ?? shortData.user_id ?? '')
    if (!igUserId) return back('Instagram returned no user id.')

    const supabase = await createServerSupabaseClient()
    await supabase.from('connected_accounts').upsert(
      {
        platform: 'instagram',
        account_id: igUserId,
        account_name: me.username || me.name || 'Instagram account',
        access_token: longToken,
        token_type: 'bearer',
        scope: 'instagram_business_basic,instagram_business_manage_insights',
        expires_at: expiresAt,
        meta: { account_type: me.account_type, profile_picture_url: me.profile_picture_url },
      },
      { onConflict: 'platform,account_id', ignoreDuplicates: false },
    )

    const ok = NextResponse.redirect(new URL('/dashboard/analytics?ig_connected=1', req.url))
    ok.cookies.delete('ig_oauth_state')
    return ok
  } catch (err) {
    return back(err instanceof Error ? err.message : 'Unknown OAuth error.')
  }
}
