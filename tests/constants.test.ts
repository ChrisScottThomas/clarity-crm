import { describe, it, expect } from 'vitest'
import { STAGES, RELATIONSHIPS, CONSTRAINTS, CONSTRAINT_COLORS, DEFAULT_RELATIONSHIP } from '../lib/constants'

describe('constants', () => {
  it('has the seven stages in order', () => {
    expect(STAGES).toEqual([
      'New Lead', 'Contacted', 'Replied', 'Call Booked', 'Call Done', 'Closed Won', 'Closed Lost',
    ])
  })
  it('defaults relationship to contact', () => {
    expect(DEFAULT_RELATIONSHIP).toBe('contact')
    expect(RELATIONSHIPS).toContain('client')
  })
  it('has the 6 Ms with brand colours', () => {
    expect(CONSTRAINTS).toEqual(['Money', 'Market', 'Model', 'Manpower', 'Metrics', 'More'])
    expect(CONSTRAINT_COLORS.Money).toBe('#ffde59')
    expect(CONSTRAINT_COLORS.More).toBe('#56d4e8')
  })
})
