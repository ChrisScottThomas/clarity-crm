import { prisma } from '../../../lib/db'
import Link from 'next/link'
import ConversationEntryForm from '../../../components/ConversationEntryForm'
import { SOURCE_LABELS } from '../../../lib/constants'

export const dynamic = 'force-dynamic'

const TYPE_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }

export default async function ConversationThread({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { conversations: { orderBy: { createdAt: 'desc' }, take: 200 } },
  })
  if (!lead) return <div className="page-body"><p>Lead not found.</p></div>

  return (
    <div className="page-body" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Link href="/activity" style={{ fontSize: 13, color: 'var(--text-muted)' }}>← Activity</Link>
          <h1 style={{ margin: '4px 0 0' }}>{lead.name}</h1>
        </div>
        <Link href={`/leads/${lead.id}`} style={{
          padding: '7px 14px', borderRadius: 6, fontSize: 13,
          background: 'var(--bg-overlay)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', textDecoration: 'none',
        }}>Open Lead →</Link>
      </div>
      <ConversationEntryForm leadId={leadId} />
      <div>
        {lead.conversations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No conversation history yet.</p>
        ) : lead.conversations.map((c: any) => (
          <div key={c.id} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{TYPE_ICONS[c.type] ?? '·'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{c.type}
                {c.source && c.source !== 'manual' ? ` · ${SOURCE_LABELS[c.source] ?? c.source}` : ''}
              </div>
              <div className="card" style={{ padding: '10px 14px' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{c.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
