import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

// Liveness for compose healthchecks, Railway, and the CI boot smoke. A 200 here
// means app *and* database are up — hence the round-trip rather than a bare OK.
// A spike watched a broken container serve /login with a 200 while every query
// 500'd; a non-DB healthcheck would have called it healthy.
// This route sits outside the auth gate (see proxy.ts), so the body is
// deliberately opaque: no provider, no connection detail, no error text.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
