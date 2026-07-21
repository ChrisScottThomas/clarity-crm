import { prisma } from '../../lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const ACTIVE_STAGES = ['New Lead', 'Contacted', 'Qualifying', 'Proposal Sent']

export default async function OpportunitiesPage() {
  const leads = await prisma.lead.findMany({
    where: { monthlyValue: { not: null } },
    orderBy: { monthlyValue: 'desc' },
  })

  const active = leads.filter((l: any) => ACTIVE_STAGES.includes(l.stage))
  const won = leads.filter((l: any) => l.stage === 'Closed Won')
  const lost = leads.filter((l: any) => l.stage === 'Closed Lost')

  const totalPipeline = active.reduce((s: number, l: any) => s + (l.monthlyValue ?? 0), 0)
  const totalWon = won.reduce((s: number, l: any) => s + (l.monthlyValue ?? 0), 0)
  const winRate = (won.length + lost.length) > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0

  return (
    <div className="page-body">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px' }}>Opportunities</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>Deals with assigned value</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Pipeline Value</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-yellow)' }}>
            ${totalPipeline.toLocaleString()}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/mo</span>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Active Deals</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{active.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Closed Won</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-green)' }}>
            ${totalWon.toLocaleString()}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/mo</span>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Win Rate</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{winRate}%</div>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600 }}>Active Opportunities</span>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Deal</th><th>Stage</th><th>Value/mo</th><th>Owner</th><th>Score</th><th></th></tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                No active opportunities. Add monthly value to leads to see them here.
              </td></tr>
            ) : (active as any[]).map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td><span style={{
                  padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                }}>{l.stage}</span></td>
                <td style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>${l.monthlyValue?.toLocaleString()}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.owner ?? '—'}</td>
                <td>{l.aiScore != null ? <span style={{ color: l.aiScore >= 70 ? 'var(--accent-orange)' : 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>{l.aiScore} {l.aiScoreLabel}</span> : '—'}</td>
                <td><Link href={`/leads/${l.id}`} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>View →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
