import { prisma } from '../../lib/db'
import Link from 'next/link'
import TimeEntryForm from '../../components/TimeEntryForm'

export const dynamic = 'force-dynamic'

export default async function TimeTrackingPage() {
  const [entries, leads] = await Promise.all([
    prisma.timeEntry.findMany({
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    }),
    prisma.lead.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const totalMinutes = entries.reduce((sum: number, e: any) => sum + e.minutes, 0)
  const totalHours = (totalMinutes / 60).toFixed(1)

  const byLead: Record<string, { name: string; minutes: number; id: string }> = {}
  for (const e of entries as any[]) {
    if (e.lead) {
      if (!byLead[e.leadId]) byLead[e.leadId] = { name: e.lead.name, minutes: 0, id: e.leadId }
      byLead[e.leadId].minutes += e.minutes
    }
  }
  const leadSummary = Object.values(byLead).sort((a, b) => b.minutes - a.minutes).slice(0, 5)

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Time Tracking</h1>
        <TimeEntryForm leads={leads} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Total Hours</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent-blue)' }}>{totalHours}h</div>
        </div>
        <div className="card">
          <div className="card-title">Entries</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>{entries.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Top Leads by Time</div>
          {leadSummary.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No entries yet</p>
          ) : leadSummary.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
              <Link href={`/leads/${l.id}`} style={{ color: 'var(--text-primary)' }}>{l.name}</Link>
              <span style={{ color: 'var(--text-muted)' }}>{(l.minutes / 60).toFixed(1)}h</span>
            </div>
          ))}
        </div>
      </div>
      {entries.length > 0 && (
        <table className="data-table">
          <thead>
            <tr><th>Description</th><th>Date</th><th>Time</th><th>Lead</th></tr>
          </thead>
          <tbody>
            {(entries as any[]).map(e => (
              <tr key={e.id}>
                <td>{e.description}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{e.minutes >= 60 ? `${Math.floor(e.minutes/60)}h ${e.minutes%60}m` : `${e.minutes}m`}</td>
                <td>{e.lead ? <Link href={`/leads/${e.lead.id}`}>{e.lead.name}</Link> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
