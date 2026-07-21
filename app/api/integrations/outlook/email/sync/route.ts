import { NextResponse } from 'next/server'
import { syncEmailActivity } from '../../../../../../lib/integrations/email-sync'

// TODO: protect when live (auth + resolve owner from session) — local/mock for now.
export async function POST() {
  try {
    const result = await syncEmailActivity()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('outlook email sync error', e)
    return NextResponse.json({ error: 'sync error' }, { status: 500 })
  }
}
