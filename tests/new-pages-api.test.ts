import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/db', () => ({ prisma: { meeting: { findMany: vi.fn(), create: vi.fn() }, timeEntry: { findMany: vi.fn(), create: vi.fn() }, conversation: { findMany: vi.fn(), create: vi.fn() }, workflowRule: { findMany: vi.fn(), create: vi.fn() } } }))

describe('new page APIs', () => {
  it('meetings API exports GET and POST', async () => {
    const mod = await import('../app/api/meetings/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
  it('time-entries API exports GET and POST', async () => {
    const mod = await import('../app/api/time-entries/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
  it('activity API exports GET and POST', async () => {
    const mod = await import('../app/api/activity/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
  it('workflows API exports GET and POST', async () => {
    const mod = await import('../app/api/workflows/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
})
