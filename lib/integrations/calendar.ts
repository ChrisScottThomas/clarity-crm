export interface CalendarEvent {
  externalId: string
  title: string
  start: Date
  end: Date
  attendees: string[]
}

export interface CalendarProvider {
  // owner: the calendar to read — a user identifier (UPN) when the Graph provider is live; ignored by the mock.
  fetchEvents(owner: string, from: Date, to: Date): Promise<CalendarEvent[]>
}

/**
 * Active provider in local dev. Returns a small fixed set of plausible Outlook
 * events spread across the requested window. One uses a documented attendee
 * (dana@acme.com) so the attendee->lead bridge can be shown once a matching lead
 * exists; the others use clearly-fake addresses that won't match anything.
 */
export class MockCalendarProvider implements CalendarProvider {
  async fetchEvents(_owner: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const at = (days: number, hours: number) => new Date(from.getTime() + days * 86400000 + hours * 3600000)
    const mk = (
      externalId: string,
      title: string,
      start: Date,
      durationMinutes: number,
      attendees: string[],
    ): CalendarEvent => ({
      externalId,
      title,
      start,
      end: new Date(start.getTime() + durationMinutes * 60000),
      attendees,
    })
    return [
      mk('outlook-mock-1', 'Discovery Call — Dana Acme', at(1, 10), 30, ['dana@acme.com']),
      mk('outlook-mock-2', 'Product Sync', at(3, 14), 60, ['sam@northwind.example']),
      mk('outlook-mock-3', 'Quarterly Review', at(7, 9), 45, ['jordan@example.com', 'lee@globex.example']),
    ].filter((e) => e.start >= from && e.start <= to)
  }
}

/** Real Microsoft Graph provider — inactive. Built when we move out of local dev. */
export class GraphCalendarProvider implements CalendarProvider {
  async fetchEvents(_owner: string, _from: Date, _to: Date): Promise<CalendarEvent[]> {
    throw new Error('GraphCalendarProvider not implemented — using mock in local dev')
  }
}

export const calendarProvider: CalendarProvider = new MockCalendarProvider()
