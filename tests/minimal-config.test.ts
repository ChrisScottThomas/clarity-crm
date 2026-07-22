import { describe, it, expect, vi } from 'vitest'

// Swap in a minimal fork config: different pipeline vocab, single owner, and the
// proprietary diagnostics framework turned off with no diagnostic vocab at all.
// Everything downstream (constants, leads, analytics) must still work.
vi.mock('../clarity.config', () => ({
  clarityConfig: {
    brand: { name: 'Acme', logo: '/logo.svg', colors: { midnight: '#000000', text: '#ffffff', blue: '#123abc' } },
    stages: ['Open', 'In Progress', 'Won', 'Lost'],
    owners: ['Sam'],
    tracks: ['Default'],
    sources: ['Inbound', 'Outbound'],
    nextActions: ['Follow up'],
    diagnosticsEnabled: false,
    constraints: [],
    constraintColors: {},
    businessDebts: [],
    debtColors: {},
    roadmapStages: [],
  },
}))

describe('minimal fork config (different vocab, diagnostics off)', () => {
  it('derives vocab and the diagnostics flag from the config', async () => {
    const { STAGES, OWNERS, CONSTRAINTS, DIAGNOSTICS_ENABLED } = await import('../lib/constants')
    expect(STAGES).toEqual(['Open', 'In Progress', 'Won', 'Lost'])
    expect(OWNERS).toEqual(['Sam'])
    expect(CONSTRAINTS).toEqual([])
    expect(DIAGNOSTICS_ENABLED).toBe(false)
  })

  it('defaults a new lead to the first configured stage, not a hardcoded label', async () => {
    const { buildNewLead } = await import('../lib/leads')
    expect(buildNewLead({ name: 'Z' }).stage).toBe('Open')
  })

  it('drives stage changes over the forked vocab and rejects unknown stages', async () => {
    const { applyStageChange } = await import('../lib/leads')
    expect(applyStageChange({ stage: 'Open' } as any, 'Won' as any).stage).toBe('Won')
    expect(() => applyStageChange({ stage: 'Open' } as any, 'Closed Won' as any)).toThrow()
  })

  it('keeps the client guardrail even with a forked config', async () => {
    const { buildNewLead } = await import('../lib/leads')
    expect(buildNewLead({ name: 'X', relationship: 'client' as any }).relationship).toBe('contact')
  })

  it('analytics tolerates an empty constraint vocab', async () => {
    const { leadsByConstraint } = await import('../lib/analytics')
    expect(leadsByConstraint([{ stage: 'Open', primaryConstraint: 'Anything' } as any])).toEqual({})
  })
})
