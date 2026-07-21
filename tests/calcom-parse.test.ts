import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyCalcomSignature, parseCalcomPayload } from '../lib/integrations/calcom'

const SECRET = 'whsec_test_123'
function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyCalcomSignature', () => {
  it('accepts a signature that matches HMAC-SHA256(rawBody, secret)', () => {
    const body = '{"triggerEvent":"BOOKING_CREATED"}'
    expect(verifyCalcomSignature(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects a signature for a tampered body', () => {
    const body = '{"triggerEvent":"BOOKING_CREATED"}'
    const sig = sign(body)
    expect(verifyCalcomSignature(body + ' ', sig, SECRET)).toBe(false)
  })

  it('rejects when the secret is wrong', () => {
    const body = '{"triggerEvent":"BOOKING_CREATED"}'
    expect(verifyCalcomSignature(body, sign(body, 'other'), SECRET)).toBe(false)
  })

  it('rejects a missing/null signature header', () => {
    const body = '{"triggerEvent":"BOOKING_CREATED"}'
    expect(verifyCalcomSignature(body, null, SECRET)).toBe(false)
  })

  it('rejects when no secret is configured', () => {
    const body = '{"triggerEvent":"BOOKING_CREATED"}'
    expect(verifyCalcomSignature(body, sign(body), '')).toBe(false)
  })
})

describe('parseCalcomPayload', () => {
  function envelope(trigger: string, payload: Record<string, unknown>) {
    return { triggerEvent: trigger, createdAt: '2026-06-27T10:00:00.000Z', payload }
  }
  const basePayload = {
    uid: 'bk_abc123',
    title: 'Discovery Call between Clarity and Acme',
    startTime: '2026-07-01T15:00:00.000Z',
    endTime: '2026-07-01T15:30:00.000Z',
    status: 'ACCEPTED',
    organizer: { name: 'Alex', email: 'alex@example.com', timeZone: 'Europe/London', username: 'alex' },
    attendees: [{ name: 'Dana Acme', email: 'dana@acme.com', timeZone: 'America/New_York' }],
    metadata: { videoCallUrl: 'https://app.cal.com/video/bk_abc123' },
  }

  it('maps BOOKING_CREATED into a normalized booking', () => {
    const b = parseCalcomPayload(envelope('BOOKING_CREATED', basePayload))
    expect(b).not.toBeNull()
    expect(b!.trigger).toBe('BOOKING_CREATED')
    expect(b!.uid).toBe('bk_abc123')
    expect(b!.title).toBe('Discovery Call between Clarity and Acme')
    expect(b!.attendeeEmail).toBe('dana@acme.com')
    expect(b!.attendeeName).toBe('Dana Acme')
    expect(b!.organizerEmail).toBe('alex@example.com')
    expect(b!.start.toISOString()).toBe('2026-07-01T15:00:00.000Z')
    expect(b!.end.toISOString()).toBe('2026-07-01T15:30:00.000Z')
  })

  it('derives durationMinutes from start and end', () => {
    const b = parseCalcomPayload(envelope('BOOKING_CREATED', basePayload))
    expect(b!.durationMinutes).toBe(30)
  })

  it('returns null for an unhandled trigger', () => {
    expect(parseCalcomPayload(envelope('MEETING_ENDED', basePayload))).toBeNull()
  })

  it('returns null when there is no attendee email', () => {
    const { attendees, ...rest } = basePayload
    void attendees
    expect(parseCalcomPayload(envelope('BOOKING_CREATED', { ...rest, attendees: [] }))).toBeNull()
  })

  it('returns null for a malformed envelope', () => {
    expect(parseCalcomPayload(null)).toBeNull()
    expect(parseCalcomPayload({ nope: true })).toBeNull()
  })

  it('extracts the reschedule reference on BOOKING_RESCHEDULED', () => {
    const b = parseCalcomPayload(
      envelope('BOOKING_RESCHEDULED', { ...basePayload, uid: 'bk_new', rescheduleUid: 'bk_abc123' }),
    )
    expect(b!.trigger).toBe('BOOKING_RESCHEDULED')
    expect(b!.uid).toBe('bk_new')
    expect(b!.rescheduledFromUid).toBe('bk_abc123')
  })
})
