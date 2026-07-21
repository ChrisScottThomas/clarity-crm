import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/db'
import { verifyCalcomSignature, parseCalcomPayload } from '../../../../../lib/integrations/calcom'
import { handleCalcomBooking } from '../../../../../lib/integrations/calcom-handler'

async function resolveSecret(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: 'calcom_signing_secret' } })
  return row?.value ?? process.env.CALCOM_SIGNING_SECRET ?? ''
}

export async function POST(req: Request) {
  // Read the RAW body first — the signature is computed over these exact bytes.
  const raw = await req.text()
  const signature = req.headers.get('x-cal-signature-256')
  const secret = await resolveSecret()

  if (!verifyCalcomSignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const booking = parseCalcomPayload(json)
  if (!booking) return NextResponse.json({ ok: true, ignored: true })

  try {
    await handleCalcomBooking(booking)
  } catch (e) {
    console.error('cal.com webhook handler error', e)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
