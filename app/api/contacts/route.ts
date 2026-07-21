import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const leads = await prisma.lead.findMany({
    where: q ? {
      OR: [
        { name: { contains: q } },
        { companyName: { contains: q } },
        { email: { contains: q } },
      ]
    } : undefined,
    include: { company: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(leads)
}
