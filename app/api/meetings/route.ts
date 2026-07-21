import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

export async function GET() {
  const meetings = await prisma.meeting.findMany({
    include: { lead: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(meetings)
}

export async function POST(req: Request) {
  const { title, date, duration, notes, leadId } = await req.json()
  if (!title || !date) {
    return NextResponse.json({ error: 'title and date required' }, { status: 400 })
  }
  const meeting = await prisma.meeting.create({
    data: { title, date: new Date(date), duration: duration ? Number(duration) : null, notes, leadId: leadId || null },
    include: { lead: { select: { id: true, name: true } } },
  })
  return NextResponse.json(meeting, { status: 201 })
}
