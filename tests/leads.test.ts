import { describe, it, expect } from 'vitest'
import { buildNewLead } from '../lib/leads'
import { applyStageChange, setRelationshipManually } from '../lib/leads'
import { STAGES } from '../lib/constants'

describe('buildNewLead', () => {
  it('defaults relationship to contact when unspecified', () => {
    const lead = buildNewLead({ name: 'Acme Founder' })
    expect(lead.relationship).toBe('contact')
  })
  it('never accepts client as a default and only via explicit manual flag', () => {
    const lead = buildNewLead({ name: 'X', relationship: 'client' as any })
    expect(lead.relationship).toBe('contact')
  })
  it('honours an explicit non-client relationship', () => {
    const lead = buildNewLead({ name: 'Y', relationship: 'prospect' })
    expect(lead.relationship).toBe('prospect')
  })
  it('defaults stage to the first configured stage', () => {
    expect(buildNewLead({ name: 'Z' }).stage).toBe(STAGES[0])
  })
})

describe('applyStageChange', () => {
  it('moving to Closed Won does NOT change relationship to client', () => {
    const lead = { relationship: 'prospect', stage: 'Call Done' } as any
    const updated = applyStageChange(lead, 'Closed Won')
    expect(updated.stage).toBe('Closed Won')
    expect(updated.relationship).toBe('prospect') // unchanged
  })
  it('rejects an unknown stage', () => {
    expect(() => applyStageChange({ stage: 'New Lead' } as any, 'Pending' as any)).toThrow()
  })
  it('sets closedDate when moving to a closed stage', () => {
    const updated = applyStageChange({ stage: 'Call Done', relationship: 'prospect' } as any, 'Closed Won')
    expect(updated.closedDate).toBeInstanceOf(Date)
  })
  it('clears closedDate when reopening to a non-closed stage', () => {
    const updated = applyStageChange({ stage: 'Closed Won', relationship: 'prospect', closedDate: new Date() } as any, 'Call Done')
    expect(updated.closedDate).toBeNull()
  })
})

describe('setRelationshipManually', () => {
  it('is the only path that can set client', () => {
    const lead = { relationship: 'prospect' } as any
    expect(setRelationshipManually(lead, 'client').relationship).toBe('client')
  })
})
