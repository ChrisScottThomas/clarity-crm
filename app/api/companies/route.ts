import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

export async function GET() {
  return NextResponse.json(await prisma.company.findMany({ include: { leads: true } }))
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  return NextResponse.json(
    await prisma.company.create({ data: { name: body.name, website: body.website, notes: body.notes } }),
    { status: 201 },
  )
}
