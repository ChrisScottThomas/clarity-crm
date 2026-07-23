import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryRaw = vi.fn()

vi.mock('../lib/db', () => ({
  prisma: {
    get $queryRaw() {
      return queryRaw
    },
  },
}))

beforeEach(async () => {
  queryRaw.mockReset()
  // The route memoizes results for 5s (see app/api/health/route.ts); reset
  // that module-level cache so each test starts from a clean slate instead
  // of reading a previous test's cached result.
  const { __resetHealthCacheForTests } = await import('../app/api/health/route')
  __resetHealthCacheForTests()
})

describe('health API', () => {
  it('exports a GET handler', async () => {
    const mod = await import('../app/api/health/route')
    expect(typeof mod.GET).toBe('function')
  })

  it('returns 200 and status ok when the database answers', async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }])
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
    // Exact key-set assertion, not just a substring blocklist: catches any
    // regression that adds a new field to the body (e.g. a provider or code).
    expect(Object.keys(body)).toEqual(['status'])
  })

  it('returns 503 when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'))
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(503)
    // Proves the 503 actually came from the query failing, not from
    // something throwing before the query ran.
    expect(queryRaw).toHaveBeenCalled()
  })

  // The route sits outside the auth gate, so it must not leak deployment
  // detail — no provider name, no connection string, no error text.
  it('leaks nothing about the deployment on failure', async () => {
    queryRaw.mockRejectedValue(new Error('postgres://user:hunter2@db:5432/clarity refused'))
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    const body = await res.json()
    // Exact key-set assertion: an allowlist, not a blocklist. The substring
    // checks below only catch the two literals in this one mocked error —
    // this is what actually catches a new field being added to the body.
    expect(Object.keys(body)).toEqual(['status'])
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain('hunter2')
    expect(bodyStr).not.toContain('postgres')
  })

  describe('memoization', () => {
    it('does not re-query within the TTL', async () => {
      queryRaw.mockResolvedValue([{ 1: 1 }])
      const { GET } = await import('../app/api/health/route')
      await GET()
      await GET()
      expect(queryRaw).toHaveBeenCalledTimes(1)
    })

    it('re-queries once the TTL has expired', async () => {
      vi.useFakeTimers()
      try {
        queryRaw.mockResolvedValue([{ 1: 1 }])
        const { GET } = await import('../app/api/health/route')
        await GET()
        vi.advanceTimersByTime(5001)
        await GET()
        expect(queryRaw).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
