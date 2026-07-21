import { describe, it, expect } from 'vitest'
import { computeMRR, leadsByStage, leadsByOwner, leadsByConstraint, callToClientRate, dmToCallRate, leadsBySource } from '../lib/analytics'

const leads = [
  { stage: 'Closed Won', monthlyValue: 500, owner: 'Alex', primaryConstraint: 'Money', relationship: 'client' },
  { stage: 'Closed Won', monthlyValue: 500, owner: 'Jordan', primaryConstraint: 'Market', relationship: 'prospect' },
  { stage: 'Call Done', monthlyValue: 999, owner: 'Alex', primaryConstraint: 'Money', relationship: 'prospect' },
] as any[]

describe('analytics', () => {
  it('MRR sums monthlyValue for Closed Won only', () => {
    expect(computeMRR(leads)).toBe(1000)
  })
  it('counts leads by stage', () => {
    expect(leadsByStage(leads)['Closed Won']).toBe(2)
    expect(leadsByStage(leads)['New Lead']).toBe(0)
  })
  it('counts leads by owner', () => {
    expect(leadsByOwner(leads)).toEqual({ Alex: 2, Jordan: 1 })
  })
  it('counts leads by constraint', () => {
    expect(leadsByConstraint(leads).Money).toBe(2)
  })
  it('call-to-client rate = clients / (Call Done or later)', () => {
    expect(callToClientRate(leads)).toBeCloseTo(1 / 3)
  })
  it('ignores unknown stage/owner/constraint values rather than adding keys', () => {
    const weird = [{ stage: 'Bogus', owner: 'Nobody', primaryConstraint: 'Vibes' }] as any[]
    expect(leadsByStage(weird)['Bogus']).toBeUndefined()
    expect(Object.keys(leadsByOwner(weird))).toEqual(['Alex', 'Jordan'])
    expect(leadsByConstraint(weird).Vibes).toBeUndefined()
  })
  it('counts leads by source and ignores unknown sources', () => {
    const sample = [
      { stage: 'New Lead', source: 'Referral' },
      { stage: 'New Lead', source: 'Referral' },
      { stage: 'New Lead', source: 'LinkedIn' },
      { stage: 'New Lead', source: 'Telepathy' }, // unknown -> ignored
    ] as any[]
    const by = leadsBySource(sample)
    expect(by.Referral).toBe(2)
    expect(by.LinkedIn).toBe(1)
    expect((by as any).Telepathy).toBeUndefined()
  })
  it('dm-to-call rate = (Call Booked or later) / (Contacted or later)', () => {
    const sample = [
      { stage: 'New Lead' },        // excluded from denominator
      { stage: 'Contacted' },       // denominator only
      { stage: 'Call Booked' },     // both
      { stage: 'Closed Won' },      // both
    ] as any[]
    // denominator = 3 (Contacted, Call Booked, Closed Won), numerator = 2 (Call Booked, Closed Won)
    expect(dmToCallRate(sample)).toBeCloseTo(2 / 3)
  })
})
