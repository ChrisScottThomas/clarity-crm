import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'
import { makeToken, SESSION_COOKIE } from '../lib/token'

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-secret-value')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

function get(path: string, cookie?: string) {
  const req = new NextRequest(new URL(`http://localhost${path}`))
  if (cookie) req.cookies.set(SESSION_COOKIE, cookie)
  return proxy(req)
}

describe('proxy — auth gate', () => {
  it('lets the cal.com webhook through without a session cookie', () => {
    const res = get('/api/integrations/calcom/webhook')
    // NextResponse.next() carries no redirect Location; redirect() would set one.
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects unauthenticated routes to /login', () => {
    const res = get('/leads')
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects a route bearing the old constant "ok" token', () => {
    const res = get('/leads', 'ok.deadbeef')
    expect(res.headers.get('location')).toContain('/login')
  })

  it('lets a route through with a valid session token', () => {
    const res = get('/leads', makeToken())
    expect(res.headers.get('location')).toBeNull()
  })
})
