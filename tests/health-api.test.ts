import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryRaw = vi.fn()

vi.mock('../lib/db', () => ({
  prisma: {
    get $queryRaw() {
      return queryRaw
    },
  },
}))

beforeEach(() => {
  queryRaw.mockReset()
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
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('returns 503 when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'))
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(503)
  })

  // The route sits outside the auth gate, so it must not leak deployment
  // detail — no provider name, no connection string, no error text.
  it('leaks nothing about the deployment on failure', async () => {
    queryRaw.mockRejectedValue(new Error('postgres://user:hunter2@db:5432/clarity refused'))
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('hunter2')
    expect(body).not.toContain('postgres')
  })
})
