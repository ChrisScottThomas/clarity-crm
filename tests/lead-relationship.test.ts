import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/db', () => ({
  prisma: {
    lead: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

describe('lead relationship API', () => {
  it('exports a PATCH handler', async () => {
    const mod = await import('../app/api/leads/[id]/relationship/route')
    expect(typeof mod.PATCH).toBe('function')
  })
})
