import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CalendarEvent } from '../lib/integrations/calendar'

vi.mock('../lib/db', () => ({
  prisma: {
    lead: { findFirst: vi.fn() },
    externalEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../lib/integrations/calendar', () => ({ calendarProvider: { fetchEvents: vi.fn() } }))

import { prisma } from '../lib/db'
import { calendarProvider } from '../lib/integrations/calendar'
import { syncCalendarEvents } from '../lib/integrations/calendar-sync'

const p = prisma as unknown as {
  lead: { findFirst: ReturnType<typeof vi.fn> }
  externalEvent: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const fetchEvents = (calendarProvider as unknown as { fetchEvents: ReturnType<typeof vi.fn> }).fetchEvents

function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    externalId: 'evt_1',
    title: 'Discovery Call',
    start: new Date('2026-07-01T10:00:00.000Z'),
    end: new Date('2026-07-01T10:30:00.000Z'),
    attendees: ['dana@acme.com'],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.lead.findFirst.mockResolvedValue(null)
  p.externalEvent.findUnique.mockResolvedValue(null)
  p.externalEvent.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'ext_new', ...data }))
  p.externalEvent.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'ext_x', ...data }))
  fetchEvents.mockResolvedValue([])
})

describe('syncCalendarEvents', () => {
  it('creates a new ExternalEvent for an unseen event', async () => {
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.externalEvent.create).toHaveBeenCalledTimes(1)
    const data = p.externalEvent.create.mock.calls[0][0].data
    expect(data.externalId).toBe('evt_1')
    expect(data.source).toBe('outlook')
    expect(data.title).toBe('Discovery Call')
    expect(result).toEqual({ created: 1, updated: 0, linked: 0 })
  })

  it('serializes attendees to a JSON string', async () => {
    fetchEvents.mockResolvedValue([ev({ attendees: ['a@x.com', 'b@y.com'] })])
    await syncCalendarEvents()
    const data = p.externalEvent.create.mock.calls[0][0].data
    expect(data.attendees).toBe(JSON.stringify(['a@x.com', 'b@y.com']))
  })

  it('links the event to a lead whose email matches an attendee', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
    expect(p.externalEvent.create.mock.calls[0][0].data.leadId).toBe('lead_1')
    expect(result.linked).toBe(1)
  })

  it('leaves leadId null when no lead matches', async () => {
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.externalEvent.create.mock.calls[0][0].data.leadId).toBeNull()
    expect(result.linked).toBe(0)
  })

  it('is idempotent: a re-synced event updates instead of duplicating', async () => {
    p.externalEvent.findUnique.mockResolvedValue({ id: 'ext_existing', externalId: 'evt_1' })
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.externalEvent.create).not.toHaveBeenCalled()
    expect(p.externalEvent.update).toHaveBeenCalledTimes(1)
    expect(p.externalEvent.update.mock.calls[0][0].where).toEqual({ id: 'ext_existing' })
    expect(result).toEqual({ created: 0, updated: 1, linked: 0 })
  })

  it('skips the lead lookup when an event has no attendees', async () => {
    fetchEvents.mockResolvedValue([ev({ attendees: [] })])
    await syncCalendarEvents()
    expect(p.lead.findFirst).not.toHaveBeenCalled()
  })

  it('accumulates counts across multiple events in one run', async () => {
    p.lead.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.email.in.includes('dana@acme.com') ? { id: 'lead_1', email: 'dana@acme.com' } : null),
    )
    fetchEvents.mockResolvedValue([
      ev({ externalId: 'evt_a', attendees: ['dana@acme.com'] }),
      ev({ externalId: 'evt_b', attendees: ['nobody@nowhere.example'] }),
    ])
    const result = await syncCalendarEvents()
    expect(p.externalEvent.create).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ created: 2, updated: 0, linked: 1 })
  })
})
