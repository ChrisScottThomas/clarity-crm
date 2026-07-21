import { STAGES, OWNERS, CONSTRAINTS, SOURCES, Stage } from './constants'

type L = {
  stage: Stage; monthlyValue?: number | null; owner?: string | null;
  primaryConstraint?: string | null; relationship?: string | null;
  source?: string | null;
}

export function computeMRR(leads: L[]): number {
  return leads.filter(l => l.stage === 'Closed Won').reduce((s, l) => s + (l.monthlyValue ?? 0), 0)
}

export function leadsByStage(leads: L[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(STAGES.map(s => [s, 0]))
  for (const l of leads) if (l.stage in out) out[l.stage] += 1
  return out
}

export function leadsByOwner(leads: L[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(OWNERS.map(o => [o, 0]))
  for (const l of leads) if (l.owner && l.owner in out) out[l.owner] += 1
  return out
}

export function leadsByConstraint(leads: L[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(CONSTRAINTS.map(c => [c, 0]))
  for (const l of leads) if (l.primaryConstraint && l.primaryConstraint in out) out[l.primaryConstraint] += 1
  return out
}

export function leadsBySource(leads: L[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(SOURCES.map(s => [s, 0]))
  for (const l of leads) {
    const src = l.source
    if (src && src in out) out[src] += 1
  }
  return out
}

const CALL_OR_LATER: Stage[] = ['Call Done', 'Closed Won', 'Closed Lost']
export function callToClientRate(leads: L[]): number {
  const reached = leads.filter(l => CALL_OR_LATER.includes(l.stage)).length
  const clients = leads.filter(l => l.relationship === 'client').length
  return reached === 0 ? 0 : clients / reached
}

const CONTACTED_OR_LATER: Stage[] = ['Contacted', 'Replied', 'Call Booked', 'Call Done', 'Closed Won', 'Closed Lost']
export function dmToCallRate(leads: L[]): number {
  const contacted = leads.filter(l => CONTACTED_OR_LATER.includes(l.stage)).length
  const booked = leads.filter(l => (['Call Booked', 'Call Done', 'Closed Won', 'Closed Lost'] as Stage[]).includes(l.stage)).length
  return contacted === 0 ? 0 : booked / contacted
}
