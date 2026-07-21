import { prisma } from '../../../lib/db'
import LeadForm from '../../../components/LeadForm'
import Link from 'next/link'
import { SOURCE_LABELS } from '../../../lib/constants'

export const dynamic = 'force-dynamic'

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const ACTIVITY_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }

export default async function LeadProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      openLoops: true,
      company: true,
      conversations: { orderBy: { createdAt: 'desc' }, take: 10 },
      meetings: { orderBy: { date: 'desc' }, take: 5 },
    },
  })
  if (!lead) return <div className="page-body"><p>Lead not found.</p></div>

  const scoreColor = lead.aiScore == null ? 'var(--text-muted)'
    : lead.aiScore >= 80 ? 'var(--accent-green)'
    : lead.aiScore >= 60 ? 'var(--accent-orange)'
    : 'var(--accent-red)'

  return (
    <div className="page-body">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 700, fontSize: 20, color: 'var(--text-secondary)',
          }}>
            {lead.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>{lead.name}</h1>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {lead.companyName ?? lead.company?.name ?? 'No company'} · {lead.stage}
            </div>
          </div>
          <span style={{
            padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
            background: lead.relationship === 'client' ? 'rgba(63,185,80,0.15)' : 'var(--bg-overlay)',
            border: `1px solid ${lead.relationship === 'client' ? 'var(--accent-green)' : 'var(--border)'}`,
            color: lead.relationship === 'client' ? 'var(--accent-green)' : 'var(--text-secondary)',
          }}>
            {lead.relationship === 'client' ? 'Client' : lead.relationship === 'deposit' ? 'Deposit' : 'Lead'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/api/leads/${id}/score`} style={{
            padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            background: 'var(--bg-overlay)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', textDecoration: 'none',
          }}>
            ⚡ Score Lead
          </Link>
          <Link href="/contacts" style={{
            padding: '7px 14px', borderRadius: 6, fontSize: 13,
            background: 'var(--bg-overlay)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', textDecoration: 'none',
          }}>
            ← Directory
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Contact Info */}
        <div className="card">
          <div className="card-title">Contact Information</div>
          <InfoRow label="Email" value={lead.email} />
          <InfoRow label="LinkedIn" value={lead.linkedinUrl} />
          <InfoRow label="Website" value={lead.website} />
          <InfoRow label="Source" value={lead.source} />
          <InfoRow label="Owner" value={lead.owner} />
          <InfoRow label="Added" value={new Date(lead.contactAdded).toLocaleDateString()} />
        </div>

        {/* Deal Details */}
        <div className="card">
          <div className="card-title">Deal Details</div>
          <InfoRow label="Stage" value={lead.stage} />
          <InfoRow label="Monthly Value" value={lead.monthlyValue != null ? `$${lead.monthlyValue.toLocaleString()}` : null} />
          <InfoRow label="Track" value={lead.track} />
          <InfoRow label="Next Action" value={lead.nextAction} />
          <InfoRow label="Date Contacted" value={lead.dateContacted ? new Date(lead.dateContacted).toLocaleDateString() : null} />
          <InfoRow label="Follow-Up" value={lead.followUpDate ? new Date(lead.followUpDate).toLocaleDateString() : null} />
          <InfoRow label="Call Date" value={lead.callDate ? new Date(lead.callDate).toLocaleDateString() : null} />
        </div>

        {/* AI Lead Qualification */}
        {lead.aiScore != null && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>⚡ Lead Qualification</div>
              <Link href={`/api/leads/${id}/score`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Re-qualify →</Link>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 80 }}>
                <div style={{ fontSize: 42, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{lead.aiScore}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: scoreColor, marginTop: 4 }}>{lead.aiScoreLabel}</div>
              </div>
              <div style={{ flex: 1 }}>
                {lead.aiSummary && (
                  <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {lead.aiSummary}
                  </p>
                )}
                {lead.aiRecommendation && (
                  <div style={{
                    background: 'var(--bg-overlay)', borderRadius: 6, padding: 12,
                    borderLeft: '3px solid var(--accent-blue)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ✦ Recommended Action
                    </div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{lead.aiRecommendation}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Open Loops */}
        {lead.openLoops.length > 0 && (
          <div className="card">
            <div className="card-title">Open Loops</div>
            {lead.openLoops.map((loop: any) => (
              <div key={loop.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: '1px solid var(--border)', opacity: loop.done ? 0.5 : 1,
              }}>
                <span style={{ fontSize: 16 }}>{loop.done ? '✅' : loop.direction === 'owed-from' ? '⬅️' : '➡️'}</span>
                <span style={{ fontSize: 13, textDecoration: loop.done ? 'line-through' : 'none' }}>{loop.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent Meetings */}
        {lead.meetings.length > 0 && (
          <div className="card">
            <div className="card-title">Recent Meetings</div>
            {lead.meetings.map((m: any) => (
              <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(m.date).toLocaleDateString()}
                  {m.duration ? ` · ${m.duration}min` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Activity */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>Activity</div>
            <Link href={`/activity/${lead.id}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Open timeline →</Link>
          </div>
          {lead.conversations.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</p>
          ) : lead.conversations.map((c: any) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{ACTIVITY_ICONS[c.type] ?? '·'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                  {c.source && c.source !== 'manual' ? ` · ${SOURCE_LABELS[c.source] ?? c.source}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Notes */}
        {lead.notes && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">Notes</div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              {lead.notes}
            </p>
          </div>
        )}

        {/* Edit Form */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">Edit Details</div>
          <LeadForm mode="edit" lead={JSON.parse(JSON.stringify(lead))} />
        </div>
      </div>
    </div>
  )
}
