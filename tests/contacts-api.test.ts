import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/db', () => ({
  prisma: {
    lead: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

describe('contacts API', () => {
  it('exports a GET handler', async () => {
    const mod = await import('../app/api/contacts/route')
    expect(typeof mod.GET).toBe('function')
  })
})
