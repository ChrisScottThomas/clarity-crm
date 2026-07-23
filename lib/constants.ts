// Derived, typed views over `clarity.config.ts`.
//
// Consumers import their vocab from here (not the config directly) so the
// compile-time union types (`Stage`, `Owner`, `Constraint`, …) live in one
// place. Editing vocab/branding happens in `clarity.config.ts`; this file only
// re-shapes it. The exceptions below (relationships, source labels, team
// mailboxes) are infrastructure — not fork-editable brand vocab.

import { clarityConfig } from '../clarity.config'

export const STAGES = clarityConfig.stages
export type Stage = typeof STAGES[number]

export const OWNERS = clarityConfig.owners
export type Owner = typeof OWNERS[number]

export const TRACKS = clarityConfig.tracks

export const SOURCES = clarityConfig.sources

export const NEXT_ACTIONS = clarityConfig.nextActions

export const CONSTRAINTS = clarityConfig.constraints
export type Constraint = typeof CONSTRAINTS[number]
// Typed as a total map over Constraint: adding a constraint without a colour is
// a compile error, which is exactly the loud failure a fork should get.
export const CONSTRAINT_COLORS: Record<Constraint, string> = clarityConfig.constraintColors

export const BUSINESS_DEBTS = clarityConfig.businessDebts
export const DEBT_COLORS = clarityConfig.debtColors

export const ROADMAP_STAGES = clarityConfig.roadmapStages

export const BRAND = clarityConfig.brand.colors

/** Whether the proprietary business-diagnostic framework is surfaced in the UI. */
export const DIAGNOSTICS_ENABLED: boolean = clarityConfig.diagnosticsEnabled

// --- Not fork-editable ------------------------------------------------------

// Relationship is load-bearing: `client` gates the "never auto-set" guardrail
// (lib/leads.ts) and the call→client conversion rate (lib/analytics.ts), so it
// stays fixed here rather than in the tenant config.
export const RELATIONSHIPS = ['contact', 'prospect', 'client', 'peer', 'advisory', 'inactive'] as const
export type Relationship = typeof RELATIONSHIPS[number]
export const DEFAULT_RELATIONSHIP: Relationship = 'contact'

// Human-readable labels for an Activity entry's provenance (Conversation.source).
export const SOURCE_LABELS: Record<string, string> = {
  'cal.com': 'cal.com', workflow: 'Auto', linkedin: 'LinkedIn', manual: 'Manual', outlook: 'Outlook',
}

// Our own team mailboxes — excluded when matching a synced email's counterpart to a lead,
// so an internal recipient never matches as the "lead". Real addresses arrive with the Graph provider.
// Configure per deployment via TEAM_EMAILS (comma-separated); defaults are placeholders.
//
// Empty and whitespace-only count as unset, deliberately. `??` alone was a bug:
// both compose files pass `TEAM_EMAILS: ${TEAM_EMAILS:-}`, which sets the
// variable to an EMPTY STRING rather than leaving it unset — `'' ?? default` is
// `''`, which splits to `['']` and filters to `[]`. An empty list makes
// lib/email-sync.ts's `.filter(addr => !TEAM_EMAILS.includes(addr))` exclude
// nobody, i.e. exactly the bug this constant exists to prevent. Same
// missing-or-empty style as lib/env.ts.
const DEFAULT_TEAM_EMAILS = 'alex@example.com,jordan@example.com'

function parseTeamEmails(raw: string): string[] {
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

const configuredTeamEmails = parseTeamEmails(process.env.TEAM_EMAILS ?? '')
export const TEAM_EMAILS: readonly string[] =
  configuredTeamEmails.length > 0 ? configuredTeamEmails : parseTeamEmails(DEFAULT_TEAM_EMAILS)
