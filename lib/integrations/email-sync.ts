import { prisma } from '../db'
import { inboxProvider } from './inbox'
import { TEAM_EMAILS } from '../constants'

const WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const DIRECTION_GLYPH = { inbound: '←', outbound: '→' } as const

/**
 * Pull recent emails from the active inbox provider, match each to a lead by the
 * counterpart address (inbound: sender; outbound: recipients minus our own team),
 * and upsert matched messages as Conversation rows (type 'email', source 'outlook')
 * idempotently by externalId. Unmatched messages are skipped. Effectful.
 * `createdAt` is set to the email's sentAt so the timeline sorts correctly.
 */
export async function syncEmailActivity(
  owner = 'shared',
): Promise<{ created: number; updated: number; skipped: number }> {
  const now = new Date()
  const from = new Date(now.getTime() - WINDOW_DAYS * DAY_MS)
  const messages = await inboxProvider.fetchMessages(owner, from, now)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const m of messages) {
    // Outbound recipients minus our own team; inbound is just the sender (the
    // filter is a harmless no-op there, kept so both directions share one path).
    const counterpart = (m.direction === 'inbound' ? [m.from] : m.to)
      .filter((addr) => !TEAM_EMAILS.includes(addr))
    const lead = counterpart.length
      ? await prisma.lead.findFirst({ where: { email: { in: counterpart } } })
      : null
    if (!lead) {
      skipped++
      continue
    }

    const data = {
      type: 'email',
      source: 'outlook',
      body: `${DIRECTION_GLYPH[m.direction]} ${m.subject} — "${m.snippet}"`,
      leadId: lead.id,
      createdAt: m.sentAt,
    }

    const existing = await prisma.conversation.findUnique({ where: { externalId: m.externalId } })
    if (existing) {
      await prisma.conversation.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.conversation.create({ data: { ...data, externalId: m.externalId } })
      created++
    }
  }

  return { created, updated, skipped }
}
