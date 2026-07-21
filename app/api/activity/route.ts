import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')
  const conversations = await prisma.conversation.findMany({
    where: leadId ? { leadId } : undefined,
    include: { lead: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(conversations)
}

export async function POST(req: Request) {
  const { type, body, leadId, source } = await req.json()
  if (!body || !leadId) {
    return NextResponse.json({ error: 'body and leadId required' }, { status: 400 })
  }
  const conv = await prisma.conversation.create({
    data: { type: type ?? 'note', source: source ?? 'manual', body, leadId },
    include: { lead: { select: { id: true, name: true } } },
  })
  return NextResponse.json(conv, { status: 201 })
}
