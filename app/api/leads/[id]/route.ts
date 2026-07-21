import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/db'
import { applyStageChange, setRelationshipManually } from '../../../../lib/leads'
import { Stage, Relationship } from '../../../../lib/constants'
import { runWorkflows } from '../../../../lib/workflow-executor'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id }, include: { company: true, openLoops: true } })
  return lead ? NextResponse.json(lead) : NextResponse.json({ error: 'not found' }, { status: 404 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const current = await prisma.lead.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let next: any = { ...body }
  // Route stage + relationship through the guarded helpers, never raw.
  if (body.stage) next = { ...next, ...applyStageChange(current as any, body.stage as Stage) }
  if (body.relationship) next = { ...next, ...setRelationshipManually(current as any, body.relationship as Relationship) }
  // The guarded helpers spread the WHOLE current lead. Strip fields that must not be
  // written back through prisma.update (id / relations / immutable createdAt-style cols).
  delete next.id
  delete next.company
  delete next.openLoops
  delete next.contactAdded
  const updated = await prisma.lead.update({ where: { id }, data: next })

  // Fire stage-change workflows when the stage actually moved.
  if (body.stage && body.stage !== current.stage) {
    await runWorkflows({
      kind: 'lead.stage_changed',
      lead: { id: updated.id, name: updated.name, email: updated.email, stage: updated.stage as Stage, owner: updated.owner },
      fromStage: current.stage as Stage,
      toStage: updated.stage as Stage,
    })
  }
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.openLoop.deleteMany({ where: { leadId: id } })
  await prisma.lead.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
