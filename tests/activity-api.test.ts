import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({
  prisma: { conversation: { findMany: vi.fn(), create: vi.fn() } },
}))

import { prisma } from '../lib/db'
import { GET, POST } from '../app/api/activity/route'

const conv = (prisma as unknown as { conversation: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).conversation

beforeEach(() => {
  vi.clearAllMocks()
  conv.findMany.mockResolvedValue([])
  conv.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'c1', ...data }))
})

describe('GET /api/activity', () => {
  it('returns the cross-lead feed when no leadId is given', async () => {
    await GET(new Request('http://localhost/api/activity'))
    expect(conv.findMany.mock.calls[0][0].where).toBeUndefined()
  })

  it('filters by leadId when provided', async () => {
    await GET(new Request('http://localhost/api/activity?leadId=lead_1'))
    expect(conv.findMany.mock.calls[0][0].where).toEqual({ leadId: 'lead_1' })
  })
})

describe('POST /api/activity', () => {
  it('400s without body or leadId', async () => {
    const res = await POST(new Request('http://localhost/api/activity', { method: 'POST', body: JSON.stringify({}) }))
    expect(res.status).toBe(400)
  })

  it('creates a manual entry by default', async () => {
    const res = await POST(new Request('http://localhost/api/activity', {
      method: 'POST', body: JSON.stringify({ type: 'note', body: 'hi', leadId: 'lead_1' }),
    }))
    expect(res.status).toBe(201)
    const data = conv.create.mock.calls[0][0].data
    expect(data.source).toBe('manual')
    expect(data.type).toBe('note')
  })

  it('honours an explicit source (e.g. linkedin)', async () => {
    await POST(new Request('http://localhost/api/activity', {
      method: 'POST', body: JSON.stringify({ type: 'linkedin', source: 'linkedin', body: 'DM', leadId: 'lead_1' }),
    }))
    const data = conv.create.mock.calls[0][0].data
    expect(data.source).toBe('linkedin')
  })
})
