import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { relationship } = await req.json()
  const allowed = ['contact', 'deposit', 'client']
  if (!allowed.includes(relationship)) {
    return NextResponse.json({ error: 'invalid relationship' }, { status: 400 })
  }
  const lead = await prisma.lead.update({ where: { id }, data: { relationship } })
  return NextResponse.json(lead)
}
