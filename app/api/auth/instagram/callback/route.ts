import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Meta OAuth callback. Exchanges the code for a short-lived token, upgrades
 * to a long-lived token (~60 days), discovers the connected IG Business
 * account, and stores everything in `connected_accounts`.
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
  if (!code) return back('Missing OAuth code from Meta.')

  const cookieState = req.cookies.get('meta_oauth_state')?.value
  if (!cookieState || cookieState !== state) return back('OAuth state mismatch — please try again.')

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI
  if (!appId || !appSecret || !redirectUri) return back('Meta env vars not configured.')

  try {
    // 1. Exchange code → short-lived user token
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)
    const shortRes = await fetch(tokenUrl, { cache: 'no-store' })
    if (!shortRes.ok) return back(`Token exchange failed: ${shortRes.status}`)
    const shortData = await shortRes.json() as { access_token: string }

    // 2. Upgrade to long-lived token (~60 days)
    const longUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
    longUrl.searchParams.set('grant_type', 'fb_exchange_token')
    longUrl.searchParams.set('client_id', appId)
    longUrl.searchParams.set('client_secret', appSecret)
    longUrl.searchParams.set('fb_exchange_token', shortData.access_token)
    const longRes = await fetch(longUrl, { cache: 'no-store' })
    if (!longRes.ok) return back(`Long-lived token exchange failed: ${longRes.status}`)
    const longData = await longRes.json() as { access_token: string; expires_in?: number }
    const longToken = longData.access_token
    const expiresAt = longData.expires_in ? new Date(Date.now() + longData.expires_in * 1000).toISOString() : null

    // 3. List Pages the user manages
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(longToken)}`, { cache: 'no-store' })
    if (!pagesRes.ok) return back(`Couldn't list Pages: ${pagesRes.status}`)
    const pagesData = await pagesRes.json() as { data: Array<{ id: string; name: string; access_token: string }> }
    const page = pagesData.data?.[0]
    if (!page) return back('No Facebook Pages found on this account. Instagram analytics requires the IG account to be linked to a Page.')

    // 4. Resolve the IG Business account ID for that Page
    const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(page.access_token)}`, { cache: 'no-store' })
    if (!igRes.ok) return back(`Couldn't resolve IG account: ${igRes.status}`)
    const igData = await igRes.json() as { instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } }
    const ig = igData.instagram_business_account
    if (!ig) return back('No Instagram Business / Creator account is linked to this Page. Convert the IG account to Business or Creator and link it in the Page settings, then try again.')

    // 5. Persist. Use the Page access token for IG Graph calls — that's
    // what /{ig-user-id}/media + /insights expect.
    const supabase = await createServerSupabaseClient()
    await supabase.from('connected_accounts').upsert(
      {
        platform: 'instagram',
        account_id: ig.id,
        account_name: ig.username || ig.name || 'Instagram account',
        access_token: page.access_token,
        token_type: 'bearer',
        scope: 'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management',
        expires_at: expiresAt,
        meta: { page_id: page.id, page_name: page.name, ig_username: ig.username, profile_picture_url: ig.profile_picture_url },
      },
      { onConflict: 'platform,account_id', ignoreDuplicates: false },
    )

    const ok = NextResponse.redirect(new URL('/dashboard/analytics?ig_connected=1', req.url))
    ok.cookies.delete('meta_oauth_state')
    return ok
  } catch (err) {
    return back(err instanceof Error ? err.message : 'Unknown OAuth error.')
  }
}
