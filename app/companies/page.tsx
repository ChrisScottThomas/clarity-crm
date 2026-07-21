import { prisma } from '../../lib/db'
import NewCompany from '../../components/NewCompany'
export const dynamic = 'force-dynamic'
export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({ orderBy: { createdAt: 'desc' }, include: { leads: true } })
  return (
    <div className="page-body">
      <h1>Companies</h1>
      <NewCompany />
      <ul>{companies.map(c => <li key={c.id}><a href={`/companies/${c.id}`}>{c.name}</a> — {c.leads.length} lead(s)</li>)}</ul>
    </div>
  )
}
