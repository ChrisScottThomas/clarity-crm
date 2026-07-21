import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'
import { TRIGGERS, ACTIONS } from '../../../lib/workflow-engine'

export async function GET() {
  const rules = await prisma.workflowRule.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(rules)
}

export async function POST(req: Request) {
  const { name, trigger, action } = await req.json()
  if (!name || !trigger || !action) {
    return NextResponse.json({ error: 'name, trigger and action required' }, { status: 400 })
  }
  // Only accept vocabulary the engine can actually execute.
  if (!TRIGGERS.includes(trigger)) {
    return NextResponse.json({ error: `unknown trigger: ${trigger}` }, { status: 400 })
  }
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
  }
  const rule = await prisma.workflowRule.create({ data: { name, trigger, action } })
  return NextResponse.json(rule, { status: 201 })
}
