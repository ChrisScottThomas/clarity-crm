import { NextResponse } from 'next/server'
import { runScheduledWorkflows } from '../../../../lib/workflow-executor'

// Manually trigger the time-based ("scheduled") workflow sweep. A future cron
// can hit this same endpoint on a timer.
export async function POST() {
  const fired = await runScheduledWorkflows()
  return NextResponse.json({ ok: true, fired })
}
