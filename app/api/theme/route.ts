import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { theme } = await req.json()
  if (theme !== 'light' && theme !== 'dark') {
    return NextResponse.json({ error: 'invalid theme' }, { status: 400 })
  }
  const jar = await cookies()
  jar.set('theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  return NextResponse.json({ theme })
}
