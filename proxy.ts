import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'fallback-secret-change-me'
)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('tui-session')?.value

  let session = null
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET)
      session = payload as { userId: string; role: string }
    } catch {
      // invalid token
    }
  }

  // Public portal + proposal routes — no auth required
  if (pathname.startsWith('/portal/') || pathname.startsWith('/proposal/')) {
    return NextResponse.next()
  }

  // Redirect logged-in users away from login
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect /dashboard routes — admin only
  if (pathname.startsWith('/dashboard')) {
    if (!session) return NextResponse.redirect(new URL('/login', request.url))
    if (session.role !== 'admin') return NextResponse.redirect(new URL('/login', request.url))
  }

  // Protect /api routes (except portal API)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/portal/')) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/api/:path*', '/proposal/:path*'],
}
