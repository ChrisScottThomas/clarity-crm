import { describe, it, expect } from 'vitest'
import { clarityConfig } from '../clarity.config'
import { validateConfig } from '../lib/config-validation'

// A deep, mutable clone we can bend into malformed shapes per-test.
const base = () => structuredClone(clarityConfig) as any

describe('validateConfig', () => {
  it('accepts the shipped default config', () => {
    expect(() => validateConfig(clarityConfig)).not.toThrow()
  })

  it('rejects an empty vocab list', () => {
    const cfg = base(); cfg.stages = []
    expect(() => validateConfig(cfg)).toThrow(/stages/)
  })

  it('rejects a blank string in a vocab list', () => {
    const cfg = base(); cfg.owners = ['Alex', '   ']
    expect(() => validateConfig(cfg)).toThrow(/owners/)
  })

  it('rejects a malformed brand colour', () => {
    const cfg = base(); cfg.brand.colors.blue = 'blue'
    expect(() => validateConfig(cfg)).toThrow(/blue/)
  })

  it('rejects a blank brand name', () => {
    const cfg = base(); cfg.brand.name = ''
    expect(() => validateConfig(cfg)).toThrow(/name/)
  })

  it('rejects a constraint missing its colour when diagnostics are on', () => {
    const cfg = base(); delete cfg.constraintColors.Money
    expect(() => validateConfig(cfg)).toThrow(/Money/)
  })

  it('rejects a malformed constraint colour', () => {
    const cfg = base(); cfg.constraintColors.Money = '#nothex'
    expect(() => validateConfig(cfg)).toThrow(/Money/)
  })

  it('rejects a non-boolean diagnosticsEnabled', () => {
    const cfg = base(); cfg.diagnosticsEnabled = 'yes'
    expect(() => validateConfig(cfg)).toThrow(/diagnosticsEnabled/)
  })

  it('accepts a minimal config with diagnostics off and no diagnostic vocab', () => {
    const cfg = {
      brand: { name: 'Acme', logo: '/x.svg', colors: { midnight: '#000000', text: '#ffffff', blue: '#123abc' } },
      stages: ['Open', 'Won'],
      owners: ['Sam'],
      tracks: ['Default'],
      sources: ['Inbound'],
      nextActions: ['Follow up'],
      diagnosticsEnabled: false,
      constraints: [],
      constraintColors: {},
      businessDebts: [],
      debtColors: {},
      roadmapStages: [],
    }
    expect(() => validateConfig(cfg as any)).not.toThrow()
  })
})
