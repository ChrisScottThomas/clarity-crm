import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

async function sign(value: string): Promise<string> {
  const secret = process.env.SESSION_SECRET ?? 'dev'
  const enc = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(value))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function valid(token?: string): Promise<boolean> {
  if (!token) return false
  const [v, sig] = token.split('.')
  if (v !== 'ok') return false
  const expected = await sign('ok')
  return sig === expected
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    // Public webhooks self-authenticate via provider signature, not the session cookie.
    pathname.startsWith('/api/integrations/calcom/webhook')
  ) {
    return NextResponse.next()
  }
  if (!(await valid(req.cookies.get('clarity_session')?.value))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
