import { prisma } from '../../lib/db'
import { computeMRR, leadsByStage, leadsByOwner, leadsByConstraint, leadsBySource, callToClientRate, dmToCallRate } from '../../lib/analytics'
import AnalyticsCharts from '../../components/AnalyticsCharts'
export const dynamic = 'force-dynamic'
export default async function Analytics() {
  const leads = await prisma.lead.findMany() as any[]
  const data = {
    mrr: computeMRR(leads), byStage: leadsByStage(leads), byOwner: leadsByOwner(leads),
    bySource: leadsBySource(leads),
    byConstraint: leadsByConstraint(leads), callToClient: callToClientRate(leads), dmToCall: dmToCallRate(leads),
  }
  return (<div className="page-body"><h1>Analytics</h1><AnalyticsCharts data={data} /></div>)
}
