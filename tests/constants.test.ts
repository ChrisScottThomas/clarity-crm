import { describe, it, expect, afterEach, vi } from 'vitest'
import { STAGES, RELATIONSHIPS, CONSTRAINTS, CONSTRAINT_COLORS, DEFAULT_RELATIONSHIP } from '../lib/constants'

// TEAM_EMAILS is computed at module load, so each case needs a fresh module
// graph rather than a re-read of the same frozen array.
async function teamEmailsWith(value: string | undefined): Promise<readonly string[]> {
  vi.resetModules()
  if (value === undefined) vi.stubEnv('TEAM_EMAILS', undefined as unknown as string)
  else vi.stubEnv('TEAM_EMAILS', value)
  const mod = await import('../lib/constants')
  return mod.TEAM_EMAILS
}

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

// Both compose files pass `TEAM_EMAILS: ${TEAM_EMAILS:-}`, which sets an EMPTY
// STRING, not an unset variable. With a bare `??` that produced an empty list,
// so lib/email-sync.ts excluded nobody from lead matching — the exact bug the
// constant exists to prevent. Empty and whitespace-only must mean "unset".
describe('constants — TEAM_EMAILS', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses the placeholder defaults when unset', async () => {
    expect(await teamEmailsWith(undefined)).toEqual(['alex@example.com', 'jordan@example.com'])
  })

  it('uses the placeholder defaults when set to an empty string (the Compose case)', async () => {
    expect(await teamEmailsWith('')).toEqual(['alex@example.com', 'jordan@example.com'])
  })

  it('uses the placeholder defaults when set to whitespace only', async () => {
    expect(await teamEmailsWith('   ')).toEqual(['alex@example.com', 'jordan@example.com'])
  })

  it('never yields an empty list, which would disable team-mailbox exclusion', async () => {
    for (const value of [undefined, '', '   ', ',', ' , ']) {
      expect(await teamEmailsWith(value)).not.toHaveLength(0)
    }
  })

  it('parses, trims and lowercases a configured list', async () => {
    expect(await teamEmailsWith(' Chris@Example.com , sam@example.com ')).toEqual([
      'chris@example.com',
      'sam@example.com',
    ])
  })
})
