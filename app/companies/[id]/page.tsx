import { prisma } from '../../../lib/db'
export const dynamic = 'force-dynamic'
export default async function CompanyProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await prisma.company.findUnique({ where: { id }, include: { leads: true } })
  if (!company) return <p>Not found.</p>
  return (
    <div>
      <h1>{company.name}</h1>
      {company.website && <p><a href={company.website}>{company.website}</a></p>}
      <p>{company.notes}</p>
      <h2>Leads</h2>
      <ul>{company.leads.map(l => <li key={l.id}><a href={`/leads/${l.id}`}>{l.name}</a> — {l.stage}</li>)}</ul>
    </div>
  )
}
