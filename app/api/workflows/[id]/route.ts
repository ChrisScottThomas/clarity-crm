import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/db'

// Toggle a rule on/off (and any other simple field updates).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: { enabled?: boolean } = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  const rule = await prisma.workflowRule.update({ where: { id }, data })
  return NextResponse.json(rule)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.workflowRule.delete({ where: { id } }) // runs cascade-delete via schema
  return NextResponse.json({ ok: true })
}
