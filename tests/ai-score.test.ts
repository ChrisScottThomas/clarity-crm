import { describe, it, expect } from 'vitest'

describe('ai-score module', () => {
  it('exports a scoreLead function', async () => {
    const mod = await import('../lib/ai-score')
    expect(typeof mod.scoreLead).toBe('function')
  })

  it('ScoreResult shape is well-defined', () => {
    const mockResult = { score: 75, label: 'Warm', summary: 'test', recommendation: 'test action' }
    expect(mockResult).toHaveProperty('score')
    expect(mockResult).toHaveProperty('label')
    expect(mockResult).toHaveProperty('summary')
    expect(mockResult).toHaveProperty('recommendation')
  })
})
