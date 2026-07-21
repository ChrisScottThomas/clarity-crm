import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await prisma.company.findUnique({ where: { id }, include: { leads: true } })
  return c ? NextResponse.json(c) : NextResponse.json({ error: 'not found' }, { status: 404 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: any = {}
  for (const k of ['name', 'website', 'notes']) if (k in body) data[k] = body[k]
  return NextResponse.json(await prisma.company.update({ where: { id }, data }))
}
