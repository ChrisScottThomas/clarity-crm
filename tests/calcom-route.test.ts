import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

const SECRET = 'whsec_route_test'

vi.mock('../lib/db', () => ({
  prisma: { setting: { findUnique: vi.fn() } },
}))
vi.mock('../lib/integrations/calcom-handler', () => ({ handleCalcomBooking: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from '../lib/db'
import { handleCalcomBooking } from '../lib/integrations/calcom-handler'
import { POST } from '../app/api/integrations/calcom/webhook/route'

const setting = (prisma as unknown as { setting: { findUnique: ReturnType<typeof vi.fn> } }).setting
const handler = handleCalcomBooking as unknown as ReturnType<typeof vi.fn>

function sign(body: string, secret = SECRET) {
  return createHmac('sha256', secret).update(body).digest('hex')
}
function req(body: string, sig: string | null) {
  return new Request('http://localhost/api/integrations/calcom/webhook', {
    method: 'POST',
    body,
    headers: sig ? { 'x-cal-signature-256': sig } : {},
  })
}

const createdBody = JSON.stringify({
  triggerEvent: 'BOOKING_CREATED',
  createdAt: '2026-06-27T10:00:00.000Z',
  payload: {
    uid: 'bk_route',
    title: 'Discovery Call',
    startTime: '2026-07-01T15:00:00.000Z',
    endTime: '2026-07-01T15:30:00.000Z',
    status: 'ACCEPTED',
    attendees: [{ name: 'Dana', email: 'dana@acme.com', timeZone: 'UTC' }],
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  setting.findUnique.mockResolvedValue({ key: 'calcom_signing_secret', value: SECRET })
})

describe('POST /api/integrations/calcom/webhook', () => {
  it('returns 401 for an invalid signature', async () => {
    const res = await POST(req(createdBody, 'deadbeef'))
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 401 when no signature header is present', async () => {
    const res = await POST(req(createdBody, null))
    expect(res.status).toBe(401)
  })

  it('returns 200 and dispatches a valid signed booking', async () => {
    const res = await POST(req(createdBody, sign(createdBody)))
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].uid).toBe('bk_route')
  })

  it('returns 200 and ignores a valid but unhandled trigger', async () => {
    const body = JSON.stringify({ triggerEvent: 'MEETING_ENDED', payload: {} })
    const res = await POST(req(body, sign(body)))
    expect(res.status).toBe(200)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 400 for a body that is not valid JSON', async () => {
    const body = 'not-json'
    const res = await POST(req(body, sign(body)))
    expect(res.status).toBe(400)
  })
})
