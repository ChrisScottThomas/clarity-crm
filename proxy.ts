import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, SESSION_COOKIE } from './lib/token'

// Renamed from `middleware.ts` per the Next 16 `proxy` convention. Proxy runs on
// the Node.js runtime, so it shares the one node-`crypto` verifier in lib/token.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    // Healthchecks (compose, Railway, CI) must not be redirected to /login —
    // an auth redirect would make every probe report a false positive.
    pathname === '/api/health' ||
    // Public webhooks self-authenticate via provider signature, not the session cookie.
    pathname.startsWith('/api/integrations/calcom/webhook')
  ) {
    return NextResponse.next()
  }
  if (!verifyToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
