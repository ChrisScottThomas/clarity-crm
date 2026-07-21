export const STAGES = [
  'New Lead', 'Contacted', 'Replied', 'Call Booked', 'Call Done', 'Closed Won', 'Closed Lost',
] as const
export type Stage = typeof STAGES[number]

export const OWNERS = ['Alex', 'Jordan'] as const
export type Owner = typeof OWNERS[number]

export const TRACKS = ['Strategic / Commercial', 'Operations / Teams'] as const

export const SOURCES = [
  'Warm DM', 'Referral', 'Content Inbound', 'FounderON', 'Cold Outreach',
  'LinkedIn', 'Inbound', 'Event', 'Networking', 'cal.com',
] as const

// Human-readable labels for an Activity entry's provenance (Conversation.source).
export const SOURCE_LABELS: Record<string, string> = {
  'cal.com': 'cal.com', workflow: 'Auto', linkedin: 'LinkedIn', manual: 'Manual', outlook: 'Outlook',
}

// Our own team mailboxes — excluded when matching a synced email's counterpart to a lead,
// so an internal recipient never matches as the "lead". Real addresses arrive with the Graph provider.
// Configure per deployment via TEAM_EMAILS (comma-separated); defaults are placeholders.
export const TEAM_EMAILS: readonly string[] = (process.env.TEAM_EMAILS ?? 'alex@example.com,jordan@example.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const NEXT_ACTIONS = [
  'Research contact', 'Send message', 'Follow up', 'Book call', 'Prepare call',
  'Send recap', 'Send proposal', 'Awaiting reply', 'Nurture', 'No action',
] as const

export const RELATIONSHIPS = ['contact', 'prospect', 'client', 'peer', 'advisory', 'inactive'] as const
export type Relationship = typeof RELATIONSHIPS[number]
export const DEFAULT_RELATIONSHIP: Relationship = 'contact'

export const CONSTRAINTS = ['Money', 'Market', 'Model', 'Manpower', 'Metrics', 'More'] as const
export type Constraint = typeof CONSTRAINTS[number]

export const CONSTRAINT_COLORS: Record<Constraint, string> = {
  More: '#56d4e8', Money: '#ffde59', Metrics: '#a78bfa',
  Manpower: '#ff3131', Market: '#dc8c32', Model: '#e850a0',
}

export const BUSINESS_DEBTS = ['Ignorance debt', 'Avoidance debt', 'Experience debt'] as const
export const DEBT_COLORS = { 'Ignorance debt': '#5271ff', 'Avoidance debt': '#34d399' } as const

export const ROADMAP_STAGES = [
  '0 (Improvise)', '1 (Monetize)', '2 (Advertise)', '3 (Stabilize)', '4 (Prioritize)',
  '5 (Productize)', '6 (Optimize)', '7 (Scale)', '8 (Scale)', '9 (Scale)',
] as const

export const BRAND = { midnight: '#020f31', text: '#ffffff', blue: '#429edb' } as const
