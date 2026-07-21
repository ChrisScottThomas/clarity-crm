import { describe, it, expect } from 'vitest'
import { triggerMatches, planEffects, planScheduledEffect, WorkflowEvent, LeadCtx } from '../lib/workflow-engine'

const lead: LeadCtx = { id: 'l1', name: 'Acme Founder', email: 'founder@acme.com', stage: 'Contacted', owner: 'Alex' }

const created: WorkflowEvent = { kind: 'lead.created', lead }
const stageToClosedWon: WorkflowEvent = { kind: 'lead.stage_changed', lead: { ...lead, stage: 'Closed Won' }, fromStage: 'Call Done', toStage: 'Closed Won' }
const scored: WorkflowEvent = { kind: 'lead.score_updated', lead, score: 82 }

describe('triggerMatches', () => {
  it('matches "Lead created" to a created event', () => {
    expect(triggerMatches('Lead created', created)).toBe(true)
    expect(triggerMatches('Lead created', scored)).toBe(false)
  })
  it('matches "Lead moved to <Stage>" only when the destination stage matches', () => {
    expect(triggerMatches('Lead moved to Closed Won', stageToClosedWon)).toBe(true)
    expect(triggerMatches('Lead moved to Closed Lost', stageToClosedWon)).toBe(false)
    expect(triggerMatches('Lead moved to Closed Won', created)).toBe(false)
  })
  it('matches "Lead score updated" to a score event', () => {
    expect(triggerMatches('Lead score updated', scored)).toBe(true)
    expect(triggerMatches('Lead score updated', stageToClosedWon)).toBe(false)
  })
  it('returns false for an unrecognised trigger string', () => {
    expect(triggerMatches('Lead moved to Qualifying', stageToClosedWon)).toBe(false)
    expect(triggerMatches('Some nonsense', created)).toBe(false)
  })
})

describe('planEffects', () => {
  it('Send email notification → an email effect addressed to the lead', () => {
    const fx = planEffects('Send email notification', stageToClosedWon)
    expect(fx).toHaveLength(1)
    expect(fx[0]).toMatchObject({ type: 'email', to: 'founder@acme.com' })
  })
  it('Send email notification with no email on lead → a noop, never a broken send', () => {
    const noEmail: WorkflowEvent = { kind: 'lead.created', lead: { ...lead, email: null } }
    expect(planEffects('Send email notification', noEmail)[0].type).toBe('noop')
  })
  it('Create follow-up reminder → a reminder effect due in 7 days', () => {
    const fx = planEffects('Create follow-up reminder', created)
    expect(fx[0]).toMatchObject({ type: 'reminder', leadId: 'l1', dueInDays: 7 })
  })
  it('Log activity note → a note effect on the lead', () => {
    const fx = planEffects('Log activity note', stageToClosedWon)
    expect(fx[0]).toMatchObject({ type: 'note', leadId: 'l1' })
  })
  it('Notify team on Slack → a slack effect', () => {
    expect(planEffects('Notify team on Slack', created)[0].type).toBe('slack')
  })
  it('Move to next stage after 7 days is time-based → noop on a live event', () => {
    expect(planEffects('Move to next stage after 7 days', created)[0].type).toBe('noop')
  })
})

describe('planScheduledEffect (time-based stage advancement)', () => {
  const now = new Date('2026-06-27T00:00:00Z')
  it('advances a lead stuck > 7 days to the next pipeline stage', () => {
    const eightDaysAgo = new Date('2026-06-18T00:00:00Z')
    const fx = planScheduledEffect('Move to next stage after 7 days', { ...lead, stage: 'Contacted' }, eightDaysAgo, now)
    expect(fx).toMatchObject({ type: 'advance_stage', leadId: 'l1', toStage: 'Replied' })
  })
  it('does nothing for a lead changed within the last 7 days', () => {
    const twoDaysAgo = new Date('2026-06-25T00:00:00Z')
    expect(planScheduledEffect('Move to next stage after 7 days', lead, twoDaysAgo, now).type).toBe('noop')
  })
  it('does not advance a lead already in a terminal stage', () => {
    const old = new Date('2026-06-01T00:00:00Z')
    expect(planScheduledEffect('Move to next stage after 7 days', { ...lead, stage: 'Closed Won' }, old, now).type).toBe('noop')
  })
})
