import { NextResponse } from 'next/server'
import { syncCalendarEvents } from '../../../../../lib/integrations/calendar-sync'

// TODO: protect when live (auth + resolve owner from session) — local/mock for now.
export async function POST() {
  try {
    const result = await syncCalendarEvents()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('outlook calendar sync error', e)
    return NextResponse.json({ error: 'sync error' }, { status: 500 })
  }
}
