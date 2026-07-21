import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/integrations/calendar-sync', () => ({ syncCalendarEvents: vi.fn() }))

import { syncCalendarEvents } from '../lib/integrations/calendar-sync'
import { POST } from '../app/api/integrations/outlook/sync/route'

const sync = syncCalendarEvents as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  sync.mockResolvedValue({ created: 2, updated: 1, linked: 1 })
})

describe('POST /api/integrations/outlook/sync', () => {
  it('runs the sync and returns the counts', async () => {
    const res = await POST()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, created: 2, updated: 1, linked: 1 })
  })

  it('500s when the sync throws', async () => {
    sync.mockRejectedValue(new Error('boom'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
