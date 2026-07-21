import { DEFAULT_RELATIONSHIP, RELATIONSHIPS, STAGES, Relationship, Stage } from './constants'

export interface NewLeadInput {
  name: string
  relationship?: Relationship
  stage?: Stage
  [key: string]: unknown
}

export interface NewLead {
  relationship: Relationship
  stage: Stage
  [key: string]: unknown
}

// client can NEVER be set through the create path — only a later explicit manual edit.
export function buildNewLead(input: NewLeadInput): NewLead {
  const requested = input.relationship
  const relationship: Relationship =
    requested && requested !== 'client' ? requested : DEFAULT_RELATIONSHIP
  return { ...input, relationship, stage: input.stage ?? 'New Lead' }
}

export function applyStageChange<T extends { stage: Stage; relationship?: Relationship; closedDate?: Date | null; stageChangedAt?: Date }>(
  lead: T, next: Stage,
): T {
  if (!STAGES.includes(next)) throw new Error(`Unknown stage: ${next}`)
  // Deliberately does NOT touch relationship. client is never inferred from stage.
  const isClosed = next === 'Closed Won' || next === 'Closed Lost'
  const closedDate = isClosed ? new Date() : null
  // Stamp when the lead entered this stage — drives time-based workflow rules.
  return { ...lead, stage: next, closedDate, stageChangedAt: new Date() }
}

export function setRelationshipManually<T extends { relationship?: Relationship }>(
  lead: T, value: Relationship,
): T {
  if (!RELATIONSHIPS.includes(value)) throw new Error(`Unknown relationship: ${value}`)
  return { ...lead, relationship: value }
}
