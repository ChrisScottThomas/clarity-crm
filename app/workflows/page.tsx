import { prisma } from '../../lib/db'
import WorkflowForm from '../../components/WorkflowForm'
import WorkflowRules from '../../components/WorkflowRules'

export const dynamic = 'force-dynamic'

export default async function WorkflowsPage() {
  const [rules, runs] = await Promise.all([
    prisma.workflowRule.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.workflowRun.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ])

  const recentRuns = runs.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }))

  return (
    <div className="page-body">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px' }}>Workflows</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          Automation rules — fire automatically on lead events; time-based rules run on the scheduled sweep
        </p>
      </div>
      <WorkflowForm />
      <WorkflowRules rules={rules} recentRuns={recentRuns} />
    </div>
  )
}
