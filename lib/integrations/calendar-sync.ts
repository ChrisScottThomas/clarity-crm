import { prisma } from '../db'
import { calendarProvider } from './calendar'

const WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Pull calendar events from the active provider, match each to a lead by
 * attendee email, and upsert ExternalEvent rows idempotently by externalId.
 * Effectful. Returns per-sync counts: `created`/`updated` rows, and `linked`
 * = events matched to a lead in this run (counted each run, not just first link).
 */
export async function syncCalendarEvents(
  owner = 'shared',
): Promise<{ created: number; updated: number; linked: number }> {
  const now = new Date()
  const to = new Date(now.getTime() + WINDOW_DAYS * DAY_MS)
  const events = await calendarProvider.fetchEvents(owner, now, to)

  let created = 0
  let updated = 0
  let linked = 0

  for (const e of events) {
    const lead = e.attendees.length
      ? await prisma.lead.findFirst({ where: { email: { in: e.attendees } } })
      : null
    const leadId = lead?.id ?? null
    if (leadId) linked++

    const data = {
      source: 'outlook',
      title: e.title,
      start: e.start,
      end: e.end,
      attendees: JSON.stringify(e.attendees),
      leadId,
    }

    const existing = await prisma.externalEvent.findUnique({ where: { externalId: e.externalId } })
    if (existing) {
      await prisma.externalEvent.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.externalEvent.create({ data: { ...data, externalId: e.externalId } })
      created++
    }
  }

  return { created, updated, linked }
}
