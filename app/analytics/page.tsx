import { prisma } from '../../lib/db'
import { computeMRR, leadsByStage, leadsByOwner, leadsByConstraint, leadsBySource, callToClientRate, dmToCallRate } from '../../lib/analytics'
import { DIAGNOSTICS_ENABLED } from '../../lib/constants'
import AnalyticsCharts from '../../components/AnalyticsCharts'
export const dynamic = 'force-dynamic'
export default async function Analytics() {
  const leads = await prisma.lead.findMany() as any[]
  const data = {
    mrr: computeMRR(leads), byStage: leadsByStage(leads), byOwner: leadsByOwner(leads),
    bySource: leadsBySource(leads),
    // The constraint breakdown belongs to the diagnostics framework — omit it when off.
    byConstraint: DIAGNOSTICS_ENABLED ? leadsByConstraint(leads) : undefined,
    callToClient: callToClientRate(leads), dmToCall: dmToCallRate(leads),
  }
  return (<div className="page-body"><h1>Analytics</h1><AnalyticsCharts data={data} /></div>)
}
