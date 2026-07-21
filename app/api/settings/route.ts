import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

export async function GET() {
  const rows = await prisma.setting.findMany()
  return NextResponse.json(Object.fromEntries(rows.map(r => [r.key, r.value])))
}

export async function PATCH(req: Request) {
  const body = await req.json() as Record<string, string>
  for (const [key, value] of Object.entries(body)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  }
  return NextResponse.json({ ok: true })
}
