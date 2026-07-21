import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

export async function GET() {
  const entries = await prisma.timeEntry.findMany({
    include: { lead: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(entries)
}

export async function POST(req: Request) {
  const { description, minutes, date, leadId } = await req.json()
  if (!description || !minutes) {
    return NextResponse.json({ error: 'description and minutes required' }, { status: 400 })
  }
  const entry = await prisma.timeEntry.create({
    data: {
      description,
      minutes: Number(minutes),
      date: date ? new Date(date) : undefined,
      leadId: leadId || null,
    },
    include: { lead: { select: { id: true, name: true } } },
  })
  return NextResponse.json(entry, { status: 201 })
}
