import { describe, it, expect } from 'vitest'
import { MockCalendarProvider, GraphCalendarProvider, calendarProvider } from '../lib/integrations/calendar'

const from = new Date('2026-06-28T00:00:00.000Z')
const to = new Date('2026-07-28T00:00:00.000Z')

describe('MockCalendarProvider', () => {
  it('returns at least three sample events', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    expect(events.length).toBeGreaterThanOrEqual(3)
  })

  it('places every event inside the requested window', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    for (const e of events) {
      expect(e.start.getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(e.start.getTime()).toBeLessThanOrEqual(to.getTime())
      expect(e.end.getTime()).toBeGreaterThan(e.start.getTime())
    }
  })

  it('includes a documented attendee so the lead bridge can be demonstrated', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    expect(events.some((e) => e.attendees.includes('dana@acme.com'))).toBe(true)
  })

  it('gives every event a unique externalId', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    const ids = events.map((e) => e.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('GraphCalendarProvider', () => {
  it('throws until implemented (we are mock-first in local dev)', async () => {
    await expect(new GraphCalendarProvider().fetchEvents('shared', from, to)).rejects.toThrow(/not implemented/i)
  })
})

describe('calendarProvider', () => {
  it('is the mock in local dev', () => {
    expect(calendarProvider).toBeInstanceOf(MockCalendarProvider)
  })
})
