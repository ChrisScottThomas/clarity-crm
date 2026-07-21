import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

function get(path: string) {
  return middleware(new NextRequest(new URL(`http://localhost${path}`)))
}

describe('middleware — cal.com webhook exemption', () => {
  it('lets the cal.com webhook through without a session cookie', async () => {
    const res = await get('/api/integrations/calcom/webhook')
    // NextResponse.next() carries no redirect Location; redirect() would set one.
    expect(res.headers.get('location')).toBeNull()
  })

  it('still redirects other unauthenticated routes to /login', async () => {
    const res = await get('/leads')
    expect(res.headers.get('location')).toContain('/login')
  })
})
