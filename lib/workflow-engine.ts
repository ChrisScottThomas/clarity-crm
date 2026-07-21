// Workflow rule execution engine — pure planning core.
//
// Mirrors the lib/leads.ts pattern: side-effect-free functions that decide WHAT
// should happen, leaving the actual I/O (prisma writes, email send) to the thin
// executor in workflow-executor.ts. This split keeps the matching/planning logic
// trivially unit-testable.
import { STAGES, Stage } from './constants'

export interface LeadCtx {
  id: string
  name: string
  email?: string | null
  stage: Stage
  owner?: string | null
}

export type WorkflowEvent =
  | { kind: 'lead.created'; lead: LeadCtx }
  | { kind: 'lead.stage_changed'; lead: LeadCtx; fromStage: Stage; toStage: Stage }
  | { kind: 'lead.score_updated'; lead: LeadCtx; score: number | null }

export interface RuleLike {
  id: string
  name: string
  trigger: string
  action: string
  enabled: boolean
}

// A planned, not-yet-performed side effect. The executor turns these into I/O.
export type WorkflowEffect =
  | { type: 'email'; to: string; subject: string; body: string }
  | { type: 'reminder'; leadId: string; description: string; dueInDays: number }
  | { type: 'note'; leadId: string; body: string }
  | { type: 'slack'; text: string }
  | { type: 'advance_stage'; leadId: string; fromStage: Stage; toStage: Stage }
  | { type: 'noop'; reason: string }

const STAGE_PREFIX = 'Lead moved to '

// Canonical trigger / action strings the engine understands. Surfaced to the UI
// so rules can only ever be created with vocabulary the engine can execute.
export const TRIGGERS: string[] = [
  'Lead created',
  ...STAGES.map(s => `${STAGE_PREFIX}${s}`),
  'Lead score updated',
]

export const ACTIONS = [
  'Send email notification',
  'Create follow-up reminder',
  'Log activity note',
  'Notify team on Slack',
  'Move to next stage after 7 days',
] as const

/** Does a stored rule trigger string fire for this event? */
export function triggerMatches(trigger: string, event: WorkflowEvent): boolean {
  if (trigger === 'Lead created') return event.kind === 'lead.created'
  if (trigger === 'Lead score updated') return event.kind === 'lead.score_updated'
  if (trigger.startsWith(STAGE_PREFIX)) {
    if (event.kind !== 'lead.stage_changed') return false
    const stage = trigger.slice(STAGE_PREFIX.length)
    return event.toStage === stage
  }
  return false
}

function summarise(event: WorkflowEvent): string {
  switch (event.kind) {
    case 'lead.created': return `${event.lead.name} was added as a new lead`
    case 'lead.stage_changed': return `${event.lead.name} moved from ${event.fromStage} to ${event.toStage}`
    case 'lead.score_updated': return `${event.lead.name}'s AI score updated to ${event.score ?? 'n/a'}`
  }
}

/** Plan the effect(s) for an event-driven action. Never performs I/O. */
export function planEffects(action: string, event: WorkflowEvent): WorkflowEffect[] {
  const lead = event.lead
  const context = summarise(event)
  switch (action) {
    case 'Send email notification': {
      if (!lead.email) return [{ type: 'noop', reason: 'lead has no email address' }]
      return [{
        type: 'email',
        to: lead.email,
        subject: `Clarity CRM: ${lead.name}`,
        body: `Automated update — ${context}.`,
      }]
    }
    case 'Create follow-up reminder':
      return [{ type: 'reminder', leadId: lead.id, description: `Follow up: ${context}`, dueInDays: 7 }]
    case 'Log activity note':
      return [{ type: 'note', leadId: lead.id, body: `[workflow] ${context}` }]
    case 'Notify team on Slack':
      return [{ type: 'slack', text: context }]
    case 'Move to next stage after 7 days':
      // Time-based — handled by planScheduledEffect via the scheduled run, not live events.
      return [{ type: 'noop', reason: 'time-based rule; runs on the scheduled sweep' }]
    default:
      return [{ type: 'noop', reason: `unknown action: ${action}` }]
  }
}

const TERMINAL_STAGES: Stage[] = ['Closed Won', 'Closed Lost']

/** Next stage in the linear pipeline, or null if at/after the last advanceable stage. */
export function nextStage(stage: Stage): Stage | null {
  if (TERMINAL_STAGES.includes(stage)) return null
  const i = STAGES.indexOf(stage)
  if (i < 0 || i >= STAGES.length - 1) return null
  const candidate = STAGES[i + 1]
  // Never auto-advance INTO a terminal (won/lost) stage — that's a human decision.
  return TERMINAL_STAGES.includes(candidate) ? null : candidate
}

/**
 * Plan the time-based "Move to next stage after 7 days" action for one lead.
 * stageChangedAt is when the lead last entered its current stage.
 */
export function planScheduledEffect(
  action: string,
  lead: LeadCtx,
  stageChangedAt: Date,
  now: Date,
): WorkflowEffect {
  if (action !== 'Move to next stage after 7 days') {
    return { type: 'noop', reason: `not a scheduled action: ${action}` }
  }
  const ageDays = (now.getTime() - stageChangedAt.getTime()) / (24 * 60 * 60 * 1000)
  if (ageDays < 7) return { type: 'noop', reason: 'lead changed stage within the last 7 days' }
  const next = nextStage(lead.stage)
  if (!next) return { type: 'noop', reason: `no automatic advance from ${lead.stage}` }
  return { type: 'advance_stage', leadId: lead.id, fromStage: lead.stage, toStage: next }
}
