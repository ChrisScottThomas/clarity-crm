import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

// Liveness for compose healthchecks, Railway, and the CI boot smoke. A 200 here
// means app *and* database are up — hence the round-trip rather than a bare OK.
// A spike watched a broken container serve /login with a 200 while every query
// 500'd; a non-DB healthcheck would have called it healthy.
// This route sits outside the auth gate (see proxy.ts), so the body is
// deliberately opaque: no provider, no connection detail, no error text.
export const dynamic = 'force-dynamic'

type HealthResult = { body: { status: 'ok' | 'error' }; status: number }

// This route is unauthenticated (see proxy.ts), so a request flood would
// otherwise drive one SELECT 1 per request through the shared pool
// (lib/db.ts, sized by DATABASE_POOL_MAX) and could starve real, authenticated
// traffic. Memoize the outcome for a short TTL to cap DB load at one query per
// TTL regardless of request volume. Both outcomes are cached — a cached
// failure is harmless — and 5s is comfortably under the 15s interval the
// compose healthcheck polls at (see deploy spec §4), so this can never make
// the check lie by more than 5s.
const CACHE_TTL_MS = 5000
let cached: { result: HealthResult; expiresAt: number } | null = null

async function checkHealth(): Promise<HealthResult> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { body: { status: 'ok' }, status: 200 }
  } catch {
    return { body: { status: 'error' }, status: 503 }
  }
}

export async function GET() {
  const now = Date.now()
  if (!cached || cached.expiresAt <= now) {
    cached = { result: await checkHealth(), expiresAt: now + CACHE_TTL_MS }
  }
  return NextResponse.json(cached.result.body, { status: cached.result.status })
}

// Test-only escape hatch: the cache above is module-level state, so tests
// need a way to start each case from a clean slate rather than reading a
// previous test's cached result.
export function __resetHealthCacheForTests() {
  cached = null
}
