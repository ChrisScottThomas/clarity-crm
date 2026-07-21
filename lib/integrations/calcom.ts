import { createHmac, timingSafeEqual } from 'node:crypto'

// Triggers we act on. Every other cal.com trigger is intentionally ignored.
export type CalcomTrigger = 'BOOKING_CREATED' | 'BOOKING_RESCHEDULED' | 'BOOKING_CANCELLED'
const HANDLED: CalcomTrigger[] = ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED']

// Normalized booking — the contract the rest of the CRM consumes. Maps the cal.com
// v2 webhook payload (https://cal.com/docs/core-features/webhooks) onto our domain.
export interface CalcomBooking {
  trigger: CalcomTrigger
  uid: string
  rescheduledFromUid?: string
  title: string
  start: Date
  end: Date
  durationMinutes: number
  status: string
  attendeeEmail: string
  attendeeName: string
  organizerEmail?: string
  notes?: string
}

/**
 * Verify cal.com's `x-cal-signature-256` header: HMAC-SHA256 of the raw request
 * body keyed by the webhook signing secret, hex-encoded. Constant-time compare.
 */
export function verifyCalcomSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/**
 * Map a raw cal.com webhook envelope `{ triggerEvent, createdAt, payload }` into a
 * normalized booking. Returns null for unhandled triggers or malformed payloads.
 */
export function parseCalcomPayload(raw: unknown): CalcomBooking | null {
  if (!raw || typeof raw !== 'object') return null
  const env = raw as Record<string, unknown>
  const trigger = env.triggerEvent
  if (typeof trigger !== 'string' || !HANDLED.includes(trigger as CalcomTrigger)) return null

  const payload = env.payload
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>

  const uid = str(p.uid)
  const startRaw = str(p.startTime)
  const endRaw = str(p.endTime)
  if (!uid || !startRaw || !endRaw) return null

  const attendees = Array.isArray(p.attendees) ? p.attendees : []
  const first = attendees[0] as Record<string, unknown> | undefined
  const attendeeEmail = str(first?.email)
  if (!attendeeEmail) return null

  const start = new Date(startRaw)
  const end = new Date(endRaw)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000)

  const organizer = (p.organizer ?? {}) as Record<string, unknown>
  const metadata = (p.metadata ?? {}) as Record<string, unknown>
  const videoCallUrl = str(metadata.videoCallUrl)

  return {
    trigger: trigger as CalcomTrigger,
    uid,
    rescheduledFromUid: str(p.rescheduleUid) ?? str(p.rescheduleId),
    title: str(p.title) ?? 'cal.com booking',
    start,
    end,
    durationMinutes,
    status: str(p.status) ?? 'ACCEPTED',
    attendeeEmail,
    attendeeName: str(first?.name) ?? attendeeEmail,
    organizerEmail: str(organizer.email),
    notes: [str(p.location), videoCallUrl].filter(Boolean).join(' · ') || undefined,
  }
}
