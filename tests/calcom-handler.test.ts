import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CalcomBooking } from '../lib/integrations/calcom'

vi.mock('../lib/db', () => ({
  prisma: {
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    meeting: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversation: { create: vi.fn() },
  },
}))
vi.mock('../lib/workflow-executor', () => ({ runWorkflows: vi.fn().mockResolvedValue(0) }))

import { prisma } from '../lib/db'
import { runWorkflows } from '../lib/workflow-executor'
import { handleCalcomBooking } from '../lib/integrations/calcom-handler'

const p = prisma as unknown as {
  lead: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  meeting: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  conversation: { create: ReturnType<typeof vi.fn> }
}
const wf = runWorkflows as unknown as ReturnType<typeof vi.fn>

function booking(over: Partial<CalcomBooking> = {}): CalcomBooking {
  return {
    trigger: 'BOOKING_CREATED',
    uid: 'bk_1',
    title: 'Discovery Call',
    start: new Date('2026-07-01T15:00:00.000Z'),
    end: new Date('2026-07-01T15:30:00.000Z'),
    durationMinutes: 30,
    status: 'ACCEPTED',
    attendeeEmail: 'dana@acme.com',
    attendeeName: 'Dana Acme',
    organizerEmail: 'alex@example.com',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.lead.findFirst.mockResolvedValue(null)
  p.lead.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'lead_new', ...data }))
  p.lead.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'lead_x', ...data }))
  p.meeting.findUnique.mockResolvedValue(null)
  p.meeting.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'mtg_new', ...data }))
  p.meeting.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'mtg_x', ...data }))
  p.conversation.create.mockResolvedValue({ id: 'conv_new' })
})

describe('handleCalcomBooking — BOOKING_CREATED', () => {
  it('creates a new lead with source cal.com when the attendee is unknown', async () => {
    await handleCalcomBooking(booking())
    expect(p.lead.create).toHaveBeenCalledTimes(1)
    const data = p.lead.create.mock.calls[0][0].data
    expect(data.email).toBe('dana@acme.com')
    expect(data.name).toBe('Dana Acme')
    expect(data.source).toBe('cal.com')
  })

  it('creates a Meeting linked to the lead with cal.com metadata', async () => {
    await handleCalcomBooking(booking())
    expect(p.meeting.create).toHaveBeenCalledTimes(1)
    const data = p.meeting.create.mock.calls[0][0].data
    expect(data.externalId).toBe('bk_1')
    expect(data.source).toBe('cal.com')
    expect(data.status).toBe('confirmed')
    expect(data.duration).toBe(30)
    expect(data.date).toEqual(new Date('2026-07-01T15:00:00.000Z'))
    expect(data.leadId).toBe('lead_new')
  })

  it('sets callDate and advances a new lead to Call Booked, firing created + stage_changed', async () => {
    await handleCalcomBooking(booking())
    const update = p.lead.update.mock.calls[0][0].data
    expect(update.callDate).toEqual(new Date('2026-07-01T15:00:00.000Z'))
    expect(update.stage).toBe('Call Booked')
    const kinds = wf.mock.calls.map((c) => c[0].kind)
    expect(kinds).toContain('lead.created')
    expect(kinds).toContain('lead.stage_changed')
  })

  it('advances an existing earlier-stage lead and fires stage_changed (not created)', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_e', name: 'Dana', email: 'dana@acme.com', stage: 'Contacted', owner: 'Alex' })
    await handleCalcomBooking(booking())
    expect(p.lead.create).not.toHaveBeenCalled()
    const kinds = wf.mock.calls.map((c) => c[0].kind)
    expect(kinds).not.toContain('lead.created')
    const sc = wf.mock.calls.find((c) => c[0].kind === 'lead.stage_changed')![0]
    expect(sc.fromStage).toBe('Contacted')
    expect(sc.toStage).toBe('Call Booked')
  })

  it('does not regress a lead already past Call Booked', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_w', name: 'Dana', email: 'dana@acme.com', stage: 'Closed Won', owner: 'Alex' })
    await handleCalcomBooking(booking())
    const stageWrites = p.lead.update.mock.calls.filter((c) => c[0].data.stage !== undefined)
    expect(stageWrites).toHaveLength(0)
    const kinds = wf.mock.calls.map((c) => c[0].kind)
    expect(kinds).not.toContain('lead.stage_changed')
  })

  it('is idempotent: a re-delivered booking updates the Meeting instead of duplicating', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_existing', externalId: 'bk_1', leadId: 'lead_e' })
    p.lead.findFirst.mockResolvedValue({ id: 'lead_e', name: 'Dana', email: 'dana@acme.com', stage: 'Call Booked', owner: 'Alex' })
    await handleCalcomBooking(booking())
    expect(p.meeting.create).not.toHaveBeenCalled()
    expect(p.meeting.update).toHaveBeenCalledTimes(1)
  })
})

describe('handleCalcomBooking — BOOKING_RESCHEDULED', () => {
  it('updates the existing meeting date/duration matched by externalId', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_1', externalId: 'bk_1', leadId: 'lead_e' })
    await handleCalcomBooking(booking({
      trigger: 'BOOKING_RESCHEDULED',
      start: new Date('2026-07-02T16:00:00.000Z'),
      end: new Date('2026-07-02T16:45:00.000Z'),
      durationMinutes: 45,
    }))
    expect(p.meeting.create).not.toHaveBeenCalled()
    const data = p.meeting.update.mock.calls[0][0].data
    expect(data.date).toEqual(new Date('2026-07-02T16:00:00.000Z'))
    expect(data.duration).toBe(45)
    expect(data.status).toBe('confirmed')
    expect(p.lead.update).toHaveBeenCalled()
  })

  it('matches the prior booking via rescheduledFromUid when the new uid is unknown', async () => {
    p.meeting.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.externalId === 'bk_old' ? { id: 'mtg_1', externalId: 'bk_old', leadId: 'lead_e' } : null),
    )
    await handleCalcomBooking(booking({ trigger: 'BOOKING_RESCHEDULED', uid: 'bk_new', rescheduledFromUid: 'bk_old' }))
    expect(p.meeting.update).toHaveBeenCalledTimes(1)
    expect(p.meeting.update.mock.calls[0][0].data.externalId).toBe('bk_new')
  })
})

describe('handleCalcomBooking — BOOKING_CANCELLED', () => {
  it('marks the meeting cancelled and leaves the lead stage untouched', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_1', externalId: 'bk_1', leadId: 'lead_e' })
    await handleCalcomBooking(booking({ trigger: 'BOOKING_CANCELLED' }))
    const data = p.meeting.update.mock.calls[0][0].data
    expect(data.status).toBe('cancelled')
    expect(data.cancelledAt).toBeInstanceOf(Date)
    expect(p.lead.update).not.toHaveBeenCalled()
    expect(wf).not.toHaveBeenCalled()
  })

  it('is a no-op when the cancelled booking has no known meeting', async () => {
    p.meeting.findUnique.mockResolvedValue(null)
    await handleCalcomBooking(booking({ trigger: 'BOOKING_CANCELLED' }))
    expect(p.meeting.update).not.toHaveBeenCalled()
  })
})

describe('handleCalcomBooking — activity entries', () => {
  it('logs a cal.com call activity entry linked to the new meeting on BOOKING_CREATED', async () => {
    await handleCalcomBooking(booking())
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('cal.com')
    expect(data.type).toBe('call')
    expect(data.meetingId).toBe('mtg_new')
    expect(data.leadId).toBe('lead_new')
    expect(data.body).toContain('Discovery Call')
  })

  it('does NOT log a second entry when a BOOKING_CREATED is re-delivered (meeting already exists)', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_existing', externalId: 'bk_1', leadId: 'lead_e' })
    p.lead.findFirst.mockResolvedValue({ id: 'lead_e', name: 'Dana', email: 'dana@acme.com', stage: 'Call Booked', owner: 'Alex' })
    await handleCalcomBooking(booking())
    expect(p.conversation.create).not.toHaveBeenCalled()
  })

  it('logs a rescheduled activity entry on BOOKING_RESCHEDULED', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_1', externalId: 'bk_1', leadId: 'lead_e' })
    await handleCalcomBooking(booking({ trigger: 'BOOKING_RESCHEDULED', start: new Date('2026-07-02T16:00:00.000Z') }))
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('cal.com')
    expect(data.meetingId).toBe('mtg_1')
    expect(data.leadId).toBe('lead_e')
    expect(data.body.toLowerCase()).toContain('reschedul')
  })

  it('logs a cancelled activity entry on BOOKING_CANCELLED', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_1', externalId: 'bk_1', leadId: 'lead_e' })
    await handleCalcomBooking(booking({ trigger: 'BOOKING_CANCELLED' }))
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('cal.com')
    expect(data.meetingId).toBe('mtg_1')
    expect(data.body.toLowerCase()).toContain('cancel')
  })

  it('does not log a cancelled entry when the booking has no known meeting', async () => {
    p.meeting.findUnique.mockResolvedValue(null)
    await handleCalcomBooking(booking({ trigger: 'BOOKING_CANCELLED' }))
    expect(p.conversation.create).not.toHaveBeenCalled()
  })

  it('does not log a rescheduled entry when the meeting has no leadId', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_1', externalId: 'bk_1', leadId: null })
    await handleCalcomBooking(booking({ trigger: 'BOOKING_RESCHEDULED' }))
    expect(p.conversation.create).not.toHaveBeenCalled()
  })
})
