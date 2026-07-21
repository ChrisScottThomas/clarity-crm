import { prisma } from '../../lib/db'
import KanbanBoard from '../../components/KanbanBoard'
export const dynamic = 'force-dynamic'
export default async function PipelinePage() {
  const leads = await prisma.lead.findMany({ orderBy: { contactAdded: 'desc' } })
  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Pipeline</h1><a href="/leads/new"><button>+ New lead</button></a>
      </div>
      <KanbanBoard initialLeads={JSON.parse(JSON.stringify(leads))} />
    </div>
  )
}
