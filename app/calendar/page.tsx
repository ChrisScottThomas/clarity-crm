import { prisma } from '../../lib/db'
import Link from 'next/link'
import SyncCalendarButton from '../../components/SyncCalendarButton'

export const dynamic = 'force-dynamic'

type Event = {
  id: string
  type: 'call' | 'follow-up' | 'close' | 'meeting' | 'outlook'
  title: string
  date: Date
  leadId?: string
}

export default async function CalendarPage() {
  const now = new Date()
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [leads, meetings, externalEvents] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          { callDate: { gte: now, lte: thirtyDaysOut } },
          { followUpDate: { gte: now, lte: thirtyDaysOut } },
          { closedDate: { gte: now, lte: thirtyDaysOut } },
        ],
      },
      select: { id: true, name: true, callDate: true, followUpDate: true, closedDate: true },
    }),
    prisma.meeting.findMany({
      where: { date: { gte: now, lte: thirtyDaysOut } },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.externalEvent.findMany({
      where: { source: 'outlook', start: { gte: now, lte: thirtyDaysOut } },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { start: 'asc' },
    }),
  ])

  const events: Event[] = []
  for (const lead of leads) {
    if (lead.callDate) events.push({ id: `call-${lead.id}`, type: 'call', title: `Call: ${lead.name}`, date: lead.callDate, leadId: lead.id })
    if (lead.followUpDate) events.push({ id: `fu-${lead.id}`, type: 'follow-up', title: `Follow up: ${lead.name}`, date: lead.followUpDate, leadId: lead.id })
    if (lead.closedDate) events.push({ id: `close-${lead.id}`, type: 'close', title: `Close: ${lead.name}`, date: lead.closedDate, leadId: lead.id })
  }
  for (const m of meetings) {
    events.push({ id: `meeting-${m.id}`, type: 'meeting', title: m.title, date: m.date, leadId: (m as any).lead?.id })
  }
  for (const ev of externalEvents) {
    events.push({ id: `ext-${ev.id}`, type: 'outlook', title: ev.title, date: ev.start, leadId: ev.lead?.id })
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime())

  const typeConfig: Record<string, { color: string; icon: string }> = {
    call: { color: 'var(--accent-blue)', icon: '📞' },
    'follow-up': { color: 'var(--accent-yellow)', icon: '🔔' },
    close: { color: 'var(--accent-green)', icon: '🎯' },
    meeting: { color: 'var(--accent-purple)', icon: '🗓️' },
    outlook: { color: 'var(--accent-orange)', icon: '📆' },
  }

  const byDay: Record<string, Event[]> = {}
  for (const e of events) {
    const key = e.date.toDateString()
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(e)
  }

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>Calendar</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>Upcoming activity · next 30 days</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SyncCalendarButton />
          <Link href="/meetings" style={{
            padding: '8px 16px', borderRadius: 6, fontSize: 14, fontWeight: 500,
            background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', textDecoration: 'none',
          }}>+ Log Meeting</Link>
        </div>
      </div>
      {events.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>📅</p>
          <p>No upcoming activity in the next 30 days.</p>
          <p style={{ fontSize: 13 }}>Set call dates and follow-up dates on your leads to see them here.</p>
        </div>
      ) : (
        Object.entries(byDay).map(([day, dayEvents]) => (
          <div key={day} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            {dayEvents.map(event => {
              const cfg = typeConfig[event.type] ?? { color: 'var(--text-muted)', icon: '·' }
              return (
                <div key={event.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{event.title}</div>
                  </div>
                  {event.leadId && (
                    <Link href={`/leads/${event.leadId}`} style={{
                      fontSize: 12, color: 'var(--text-secondary)',
                      padding: '4px 10px', borderRadius: 6,
                      background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                    }}>View Lead →</Link>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
