import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { exchangeCodeForToken, listConnections } from '@/lib/xero'

export const dynamic = 'force-dynamic'

function errorRedirect(req: NextRequest, msg: string): NextResponse {
  const url = new URL('/dashboard/finance', req.url)
  url.searchParams.set('xero_error', msg)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')
  if (error) return errorRedirect(req, error)
  if (!code || !state) return errorRedirect(req, 'missing_code_or_state')

  const cookieState = req.cookies.get('xero_oauth_state')?.value
  if (!cookieState) {
    return errorRedirect(req, 'state_cookie_missing — your browser did not return the CSRF cookie. Try again in a fresh tab; if it persists, check 3rd-party cookie settings.')
  }
  if (cookieState !== state) {
    return errorRedirect(req, 'state_value_mismatch')
  }

  let tokens
  try {
    tokens = await exchangeCodeForToken(code)
  } catch (e) {
    return errorRedirect(req, 'token_exchange_failed:' + (e as Error).message.slice(0, 80))
  }

  let connections
  try {
    connections = await listConnections(tokens.access_token)
  } catch (e) {
    return errorRedirect(req, 'connections_lookup_failed:' + (e as Error).message.slice(0, 80))
  }

  if (!connections.length) {
    return errorRedirect(req, 'no_orgs_connected')
  }

  // Use the first organisation. Users with multiple orgs can revisit and
  // re-authorise; we'll add an org picker if that ever becomes a need.
  const conn = connections[0]
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Use service role for the upsert so RLS doesn't block writes from this
  // route (the connected_accounts policies are scoped to authenticated, but
  // the cron-run sync also needs read access via service role).
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  await admin
    .from('connected_accounts')
    .upsert(
      {
        platform: 'xero',
        account_id: conn.tenantId,
        account_name: conn.tenantName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        scope: tokens.scope,
        expires_at: expiresAt,
        meta: { tenantType: conn.tenantType, shortCode: conn.shortCode ?? null },
      },
      { onConflict: 'platform,account_id' },
    )

  const res = NextResponse.redirect(new URL('/dashboard/finance?xero=connected', req.url))
  res.cookies.delete('xero_oauth_state')
  return res
}
