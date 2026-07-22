import { describe, it, expect, afterEach, vi } from 'vitest'
import { getSessionSecret, assertProductionSecrets } from '../lib/env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('env — session secret', () => {
  it('returns the configured SESSION_SECRET when set', () => {
    vi.stubEnv('SESSION_SECRET', 'a-real-secret')
    expect(getSessionSecret()).toBe('a-real-secret')
  })

  it('falls back to a dev secret outside production when unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SESSION_SECRET', '')
    expect(getSessionSecret()).toBeTruthy()
  })

  it('throws in production when SESSION_SECRET is unset', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', '')
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
  })
})

describe('env — assertProductionSecrets (boot-time fail-closed)', () => {
  it('does not throw outside production even when secrets are missing', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRM_PASSWORD', '')
    expect(() => assertProductionSecrets()).not.toThrow()
  })

  it('throws in production when SESSION_SECRET is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRM_PASSWORD', 'set')
    expect(() => assertProductionSecrets()).toThrow(/SESSION_SECRET/)
  })

  it('throws in production when CRM_PASSWORD is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'set')
    vi.stubEnv('CRM_PASSWORD', '')
    expect(() => assertProductionSecrets()).toThrow(/CRM_PASSWORD/)
  })
})
