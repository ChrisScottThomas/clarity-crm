import { prisma } from '../../lib/db'
import Link from 'next/link'
import MeetingForm from '../../components/MeetingForm'

export const dynamic = 'force-dynamic'

export default async function MeetingsPage() {
  const [meetings, leads] = await Promise.all([
    prisma.meeting.findMany({
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    }),
    prisma.lead.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Meetings</h1>
        <MeetingForm leads={leads} />
      </div>
      {meetings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>🗓️</p>
          <p>No meetings logged yet.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Meeting</th>
              <th>Date</th>
              <th>Duration</th>
              <th>Lead</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m: any) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.title}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{m.duration ? `${m.duration}min` : '—'}</td>
                <td>{m.lead ? <Link href={`/leads/${m.lead.id}`}>{m.lead.name}</Link> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
