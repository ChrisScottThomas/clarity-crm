import { prisma } from '../../lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type Lead = Awaited<ReturnType<typeof prisma.lead.findMany>>[number]

function groupByCompany(leads: Lead[]): Record<string, Lead[]> {
  const map: Record<string, Lead[]> = {}
  for (const lead of leads) {
    const key = (lead as any).companyName ?? (lead as any).company?.name ?? 'Individual / Personal'
    if (!map[key]) map[key] = []
    map[key].push(lead)
  }
  return map
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; id?: string; q?: string }>
}) {
  const { view = 'all', id, q = '' } = await searchParams
  const leads = await prisma.lead.findMany({
    where: q ? {
      OR: [
        { name: { contains: q } },
        { companyName: { contains: q } },
        { email: { contains: q } },
      ]
    } : undefined,
    include: { company: true },
    orderBy: { name: 'asc' },
  })
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } })
  const selected = id ? leads.find((l: any) => l.id === id) : null
  const grouped = groupByCompany(leads)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{
        width: 320,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Directory</h2>
          <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: 13 }}>
            {leads.length} contacts · {companies.length} companies
          </p>
          <form method="GET" action="/contacts">
            <input type="hidden" name="view" value={view} />
            {id && <input type="hidden" name="id" value={id} />}
            <input
              name="q"
              placeholder="Search contacts, companies..."
              defaultValue={q}
              style={{ marginBottom: 8 }}
            />
          </form>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/contacts?view=all${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: view === 'all' ? 'var(--accent-blue)' : 'var(--bg-overlay)',
                color: view === 'all' ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>All</Link>
            <Link href={`/contacts?view=company${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: view === 'company' ? 'var(--accent-blue)' : 'var(--bg-overlay)',
                color: view === 'company' ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>By Company</Link>
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {view === 'company' ? (
            Object.entries(grouped).map(([company, contacts]) => (
              <div key={company}>
                <div style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 600,
                  color: 'var(--text-muted)', background: 'var(--bg-overlay)',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{company}</span><span>{contacts.length}</span>
                </div>
                {contacts.map((lead: any) => (
                  <Link key={lead.id}
                    href={`/contacts?view=company${q ? `&q=${encodeURIComponent(q)}` : ''}&id=${lead.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', borderBottom: '1px solid var(--border)',
                      background: id === lead.id ? 'var(--sidebar-active)' : 'transparent',
                      color: 'var(--text-primary)',
                    }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-overlay)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13, flexShrink: 0, color: 'var(--text-secondary)',
                    }}>{lead.name.charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{lead.stage}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ))
          ) : (
            leads.map((lead: any) => (
              <Link key={lead.id}
                href={`/contacts?view=all${q ? `&q=${encodeURIComponent(q)}` : ''}&id=${lead.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', borderBottom: '1px solid var(--border)',
                  background: id === lead.id ? 'var(--sidebar-active)' : 'transparent',
                  color: 'var(--text-primary)',
                }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-overlay)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, flexShrink: 0, color: 'var(--text-secondary)',
                }}>{lead.name.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {(lead as any).companyName ?? lead.company?.name ?? 'No company'} · {lead.stage}
                  </div>
                </div>
                {(lead as any).aiScore != null && (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: (lead as any).aiScore >= 70 ? 'var(--accent-orange)' : 'var(--bg-overlay)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    color: (lead as any).aiScore >= 70 ? '#fff' : 'var(--text-muted)',
                  }}>{(lead as any).aiScore}</div>
                )}
              </Link>
            ))
          )}
        </div>
      </div>
      {/* Right panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {selected ? (
          <ContactDetail lead={selected as any} />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--text-muted)', flexDirection: 'column', gap: 8,
          }}>
            <span style={{ fontSize: 48 }}>👥</span>
            <p>Select a contact to view their profile</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function ContactDetail({ lead }: { lead: any }) {
  const scoreColor = lead.aiScore == null ? 'var(--text-muted)'
    : lead.aiScore >= 80 ? 'var(--accent-green)'
    : lead.aiScore >= 60 ? 'var(--accent-orange)'
    : 'var(--accent-red)'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-overlay)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 22, color: 'var(--text-secondary)',
            border: '2px solid var(--border)',
          }}>{lead.name.charAt(0).toUpperCase()}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{lead.name}</h1>
              <span style={{
                padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}>{lead.relationship === 'client' ? 'Client' : 'Lead'}</span>
              {lead.aiScore != null && (
                <span style={{
                  padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  color: scoreColor,
                }}>● {lead.aiScore}</span>
              )}
            </div>
            {lead.companyName && <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>{lead.companyName}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {lead.relationship !== 'client' && (
            <button style={{ background: 'var(--accent-green)', padding: '7px 14px', fontSize: 13 }}>✓ Mark as Customer</button>
          )}
          <Link href={`/leads/${lead.id}`} style={{
            padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            background: 'var(--bg-overlay)', border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}>Open Profile →</Link>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-title">Contact Information</div>
          <InfoRow label="Email" value={lead.email} />
          <InfoRow label="Source" value={lead.source} />
          <InfoRow label="Owner" value={lead.owner} />
          <InfoRow label="Added" value={lead.contactAdded ? new Date(lead.contactAdded).toLocaleDateString() : null} />
        </div>
        <div className="card">
          <div className="card-title">Deal Details</div>
          <InfoRow label="Stage" value={lead.stage} />
          <InfoRow label="Monthly Value" value={lead.monthlyValue != null ? `$${lead.monthlyValue.toLocaleString()}` : null} />
          <InfoRow label="Track" value={lead.track} />
          <InfoRow label="Next Action" value={lead.nextAction} />
        </div>
        {lead.aiScoreLabel && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>⚡ Lead Qualification</div>
              <Link href={`/leads/${lead.id}`} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Re-qualify →</Link>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor }}>{lead.aiScore}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: scoreColor }}>{lead.aiScoreLabel}</div>
              </div>
              <div>
                {lead.aiSummary && <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{lead.aiSummary}</p>}
                {lead.aiRecommendation && (
                  <div style={{ background: 'var(--bg-overlay)', borderRadius: 6, padding: 12, borderLeft: '3px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', marginBottom: 4, textTransform: 'uppercase' }}>✦ Recommended Action</div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>{lead.aiRecommendation}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {lead.notes && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">Notes</div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{lead.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
