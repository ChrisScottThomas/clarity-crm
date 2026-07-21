import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'
import { buildNewLead } from '../../../lib/leads'
import { runWorkflows } from '../../../lib/workflow-executor'
import { Stage } from '../../../lib/constants'

export async function GET() {
  const leads = await prisma.lead.findMany({ include: { company: true }, orderBy: { contactAdded: 'desc' } })
  return NextResponse.json(leads)
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const data = buildNewLead(body) // enforces relationship default + client block
  const lead = await prisma.lead.create({ data: data as any })
  await runWorkflows({
    kind: 'lead.created',
    lead: { id: lead.id, name: lead.name, email: lead.email, stage: lead.stage as Stage, owner: lead.owner },
  })
  return NextResponse.json(lead, { status: 201 })
}
