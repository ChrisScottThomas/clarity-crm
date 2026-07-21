import { prisma } from '../db'
import { runWorkflows } from '../workflow-executor'
import { applyStageChange } from '../leads'
import { STAGES, Stage } from '../constants'
import type { LeadCtx } from '../workflow-engine'
import type { CalcomBooking } from './calcom'

const CALL_BOOKED: Stage = 'Call Booked'

function fmt(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * Apply a normalized cal.com booking to the CRM. Effectful: writes Lead/Meeting and
 * fires the workflow engine. Dispatches on the booking trigger.
 */
export async function handleCalcomBooking(b: CalcomBooking): Promise<void> {
  switch (b.trigger) {
    case 'BOOKING_CANCELLED':
      return cancelBooking(b)
    case 'BOOKING_RESCHEDULED':
      return rescheduleBooking(b)
    default:
      return createBooking(b)
  }
}

async function createBooking(b: CalcomBooking): Promise<void> {
  let lead = await prisma.lead.findFirst({ where: { email: b.attendeeEmail } })
  let isNew = false
  if (!lead) {
    lead = await prisma.lead.create({
      data: { name: b.attendeeName, email: b.attendeeEmail, source: 'cal.com', stage: 'New Lead' },
    })
    isNew = true
  }

  const meeting = await upsertMeeting(b, lead.id)

  const fromStage = lead.stage as Stage
  const advancing = STAGES.indexOf(fromStage) < STAGES.indexOf(CALL_BOOKED)

  const data: Record<string, unknown> = { callDate: b.start }
  if (advancing) {
    const advanced = applyStageChange(
      { stage: fromStage, stageChangedAt: new Date(), closedDate: null as Date | null },
      CALL_BOOKED,
    )
    data.stage = advanced.stage
    data.stageChangedAt = advanced.stageChangedAt
    data.closedDate = advanced.closedDate
  }
  await prisma.lead.update({ where: { id: lead.id }, data })

  const ctx: LeadCtx = {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    stage: advancing ? CALL_BOOKED : fromStage,
    owner: lead.owner,
  }
  if (isNew) await runWorkflows({ kind: 'lead.created', lead: ctx })
  if (advancing) await runWorkflows({ kind: 'lead.stage_changed', lead: ctx, fromStage, toStage: CALL_BOOKED })

  if (meeting.created) {
    await prisma.conversation.create({
      data: {
        leadId: lead.id,
        meetingId: meeting.id,
        type: 'call',
        source: 'cal.com',
        body: `Call booked: ${b.title} — ${fmt(b.start)}`,
      },
    })
  }
}

async function rescheduleBooking(b: CalcomBooking): Promise<void> {
  let meeting = await prisma.meeting.findUnique({ where: { externalId: b.uid } })
  if (!meeting && b.rescheduledFromUid) {
    meeting = await prisma.meeting.findUnique({ where: { externalId: b.rescheduledFromUid } })
  }
  if (!meeting) return createBooking(b) // never seen this booking — treat as new

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { date: b.start, duration: b.durationMinutes, status: 'confirmed', notes: b.notes, externalId: b.uid },
  })
  if (meeting.leadId) {
    await prisma.lead.update({ where: { id: meeting.leadId }, data: { callDate: b.start } })
  }

  if (meeting.leadId) {
    await prisma.conversation.create({
      data: {
        leadId: meeting.leadId,
        meetingId: meeting.id,
        type: 'call',
        source: 'cal.com',
        body: `Call rescheduled to ${fmt(b.start)}`,
      },
    })
  }
}

async function cancelBooking(b: CalcomBooking): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { externalId: b.uid } })
  if (!meeting) return
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: 'cancelled', cancelledAt: new Date() },
  })

  if (meeting.leadId) {
    await prisma.conversation.create({
      data: {
        leadId: meeting.leadId,
        meetingId: meeting.id,
        type: 'call',
        source: 'cal.com',
        body: 'Call cancelled',
      },
    })
  }
}

async function upsertMeeting(b: CalcomBooking, leadId: string): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.meeting.findUnique({ where: { externalId: b.uid } })
  const data = {
    title: b.title,
    date: b.start,
    duration: b.durationMinutes,
    notes: b.notes,
    leadId,
    source: 'cal.com',
    status: 'confirmed',
    externalId: b.uid,
  }
  if (existing) {
    await prisma.meeting.update({ where: { id: existing.id }, data })
    return { id: existing.id, created: false }
  }
  const row = await prisma.meeting.create({ data })
  return { id: row.id, created: true }
}
