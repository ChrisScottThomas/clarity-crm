import { prisma } from '../../lib/db'
import Link from 'next/link'
import { SOURCE_LABELS } from '../../lib/constants'
import SyncEmailButton from '../../components/SyncEmailButton'

export const dynamic = 'force-dynamic'

const TYPE_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }

export default async function ActivityPage() {
  const entries = await prisma.conversation.findMany({
    include: { lead: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <div className="page-body" style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 24px' }}>
        <h1 style={{ margin: 0 }}>Activity</h1>
        <SyncEmailButton />
      </div>
      {entries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>🗒️</p>
          <p>No activity yet. Bookings, workflow notes, and manual entries will appear here.</p>
        </div>
      ) : entries.map((e: any) => (
        <div key={e.id} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{TYPE_ICONS[e.type] ?? '·'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Link href={`/leads/${e.lead.id}`} style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
                {e.lead.name}
              </Link>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {new Date(e.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="card" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{e.body}</p>
                <span style={{
                  flexShrink: 0, fontSize: 11, color: 'var(--text-muted)', alignSelf: 'flex-start',
                  border: '1px solid var(--border)', borderRadius: 10, padding: '1px 8px',
                }}>{SOURCE_LABELS[e.source] ?? e.source}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
