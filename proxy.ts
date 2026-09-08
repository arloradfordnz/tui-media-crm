import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Cookie-local session lookup — no network roundtrip.
  // getUser() validates with the auth server (~200-500ms) which we previously
  // ran on every navigation; we only need that level of trust for actual data
  // access, which the page-level Supabase client still does. Routing decisions
  // can rely on the signed cookie.
  const { data: { session } } = await supabase.auth.getSession()
  let user = session?.user ?? null

  const { pathname } = request.nextUrl

  // ── Repair a token that predates the account's admin role ────────────────
  // is_admin() reads app_metadata.role out of the JWT, so a session that was
  // signed in BEFORE the role was granted keeps presenting a roleless token
  // and is denied by every RLS policy — an empty CRM that looks exactly like
  // deleted data. See lib/client-auth.ts for the incident.
  //
  // This has to happen HERE and nowhere else. Refreshing rotates the refresh
  // token and invalidates the old one, so the caller must be able to persist
  // the new pair. Middleware can — setAll above writes to supabaseResponse.
  // A Server Component cannot, and doing it there burns the browser's token
  // and signs the user out on the next request.
  //
  // Bounded to one attempt per request, and only for a signed-in non-client
  // that is missing the claim, so the normal path costs nothing.
  const role = user?.app_metadata?.role
  if (user && role !== 'client' && role !== 'admin') {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.user) user = refreshed.user
  }

  // Client portal accounts share this Supabase project with Arlo's admin
  // login, so "is anyone signed in" no longer decides where they may go.
  //
  // This claim is read from the cookie, which is fine for *routing* — the
  // worst a tampered cookie achieves is landing on a page it isn't entitled
  // to. It does not decide access: the dashboard layout re-checks against the
  // auth server, getAuthUser() denies clients on every API route, and RLS
  // denies them at the database. This is signposting, not the lock.
  const isClient = user?.app_metadata?.role === 'client'

  // Send each kind of account to its own front door.
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL(isClient ? '/portal/me' : '/dashboard', request.url))
  }
  if (pathname === '/portal/login' && user) {
    return NextResponse.redirect(new URL(isClient ? '/portal/me' : '/dashboard', request.url))
  }

  // Protect /dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    if (isClient) return NextResponse.redirect(new URL('/portal/me', request.url))
  }

  // /portal/me is the signed-in portal; the token links under
  // /portal/client/... stay public, as do login and the setup callback.
  if (pathname.startsWith('/portal/me') && !user) {
    return NextResponse.redirect(new URL('/portal/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
